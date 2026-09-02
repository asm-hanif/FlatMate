/**
 * ============================================================
 * FlatMate Flat-Finder — criteria-based recommendation engine
 * ============================================================
 *
 * Given a user's stated criteria (budget, city/area, purpose,
 * bedrooms, property type, wanted amenities), this pulls
 * candidate active listings from the database and ranks them
 * with a weighted scoring function rather than a plain SQL
 * WHERE-clause filter. That means a flat that's a near miss on
 * one dimension (say, slightly over budget but a perfect location
 * and amenity match) can still surface instead of being excluded
 * outright — closer to how a helpful human agent would search.
 *
 * It also calls the price model to flag whether each suggested
 * flat looks like a fair deal, a bargain, or overpriced relative
 * to comparable properties in the same area.
 */

const { executeSql, sql } = require('../server/db');
const priceModel = require('./priceModel');
const { matchArea } = require('./data/locationRates');

function normalize(text) {
    return String(text || '').toLowerCase().trim();
}

/**
 * @param {object} criteria
 *   purpose: 'Rent' | 'Sale' | 'Any'
 *   city, areaName: strings (optional)
 *   propertyType: string (optional)
 *   budgetMax: number (optional)
 *   budgetMin: number (optional)
 *   bedrooms: number (optional, "at least")
 *   minArea, maxArea: numbers (optional, sqft)
 *   amenities: string[] (optional, column names from AMENITY_COLUMNS)
 *   limit: number (default 5)
 */
async function suggestFlats(criteria) {
    const {
        purpose,
        city,
        areaName,
        propertyType,
        budgetMax,
        budgetMin,
        bedrooms,
        minArea,
        maxArea,
        amenities = [],
        limit = 5
    } = criteria;

    const conditions = ["IsActive = 1", "AvailabilityStatus = 'Available'"];
    const params = [];

    if (purpose && purpose !== 'Any') {
        conditions.push("(Purpose = @purpose OR Purpose = 'Rent & Sale')");
        params.push({ name: 'purpose', type: sql.NVarChar(20), value: purpose });
    }

    if (propertyType && propertyType !== 'Any') {
        conditions.push('PropertyType = @propertyType');
        params.push({ name: 'propertyType', type: sql.NVarChar(50), value: propertyType });
    }

    // Budget is treated loosely in scoring below rather than strictly
    // filtered here, EXCEPT we still exclude wild outliers (>2.5x budget)
    // so the candidate pool stays relevant and the query stays fast.
    if (budgetMax) {
        conditions.push('Price <= @budgetCeiling');
        params.push({ name: 'budgetCeiling', type: sql.Decimal(18, 2), value: Number(budgetMax) * 2.5 });
    }

    if (minArea) {
        conditions.push('(Area IS NULL OR Area >= @minArea)');
        params.push({ name: 'minArea', type: sql.Decimal(10, 2), value: Number(minArea) });
    }

    if (maxArea) {
        conditions.push('(Area IS NULL OR Area <= @maxArea)');
        params.push({ name: 'maxArea', type: sql.Decimal(10, 2), value: Number(maxArea) });
    }

    const query = `
        SELECT *
        FROM dbo.Flats
        WHERE ${conditions.join(' AND ')}
        ORDER BY CreatedAt DESC
        LIMIT 60;
    `;

    const candidates = await executeSql(query, params);

    if (!candidates.length) {
        return { results: [], candidateCount: 0 };
    }

    const scored = candidates.map(flat => scoreFlat(flat, {
        purpose, city, areaName, budgetMax, budgetMin, bedrooms, amenities
    }));

    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, limit);

    // Attach a main image for each result (mirrors flatController's pattern).
    for (const item of top) {
        const media = await executeSql(
            `SELECT Url FROM dbo.FlatMedia WHERE FlatId = @id AND MediaType = 'image' ORDER BY Id LIMIT 1`,
            [{ name: 'id', type: sql.Int, value: item.flat.Id }]
        );
        item.flat.mainImage = media.length ? media[0].Url : null;
    }

    return { results: top, candidateCount: candidates.length };
}

function scoreFlat(flat, criteria) {
    const { purpose, city, areaName, budgetMax, budgetMin, bedrooms, amenities } = criteria;

    let score = 0;
    const reasons = [];

    // ---- Location match (highest weight) ----
    const wantCity = normalize(city);
    const wantArea = normalize(areaName);
    const flatCity = normalize(flat.City);
    const flatArea = normalize(flat.AreaName);

    if (wantArea && flatArea && (flatArea.includes(wantArea) || wantArea.includes(flatArea))) {
        score += 40;
        reasons.push(`in ${flat.AreaName}`);
    } else if (wantCity && flatCity && (flatCity.includes(wantCity) || wantCity.includes(flatCity))) {
        score += 22;
        reasons.push(`in ${flat.City}`);
    } else if (!wantCity && !wantArea) {
        score += 8; // no location preference stated — small neutral credit
    }

    // ---- Budget fit ----
    const price = Number(flat.Price) || 0;
    if (budgetMax) {
        const max = Number(budgetMax);
        if (price <= max) {
            score += 25;
            if (price >= max * 0.7) reasons.push('fits your budget well');
            else reasons.push('comfortably under your budget');
        } else {
            const overBy = (price - max) / max;
            score += Math.max(25 - overBy * 60, -20); // heavy penalty the further over budget
            if (overBy <= 0.15) reasons.push('slightly above your budget');
        }
    }

    if (budgetMin && price < Number(budgetMin)) {
        score -= 5; // unusually cheap for the stated range can mean lower quality/hidden issues
    }

    // ---- Bedrooms ----
    if (bedrooms) {
        const wanted = Number(bedrooms);
        const actual = Number(flat.Bedrooms) || 0;
        if (actual === wanted) { score += 15; reasons.push(`${actual} bedrooms as requested`); }
        else if (actual === wanted + 1) { score += 10; reasons.push(`${actual} bedrooms (one more than requested)`); }
        else if (actual > wanted) { score += 4; }
        else if (actual === wanted - 1) { score += 3; }
    }

    // ---- Amenity overlap ----
    if (amenities && amenities.length) {
        const matched = amenities.filter(col => flat[col]);
        score += matched.length * 4;
        if (matched.length) reasons.push(`has ${matched.length} of your ${amenities.length} wanted amenities`);
    }

    // ---- Freshness (small tiebreaker) ----
    if (flat.CreatedAt) {
        const ageDays = (Date.now() - new Date(flat.CreatedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays < 14) score += 3;
    }

    // ---- Fair-price signal from the price model ----
    let priceFairness = null;
    try {
        const areaSqft = priceModel.toSqft(flat.Area, flat.AreaUnit);
        if (areaSqft && areaSqft >= 100) {
            const prediction = priceModel.predictPrice({
                purpose: flat.Purpose,
                city: flat.City,
                areaName: flat.AreaName,
                propertyType: flat.PropertyType,
                area: flat.Area,
                areaUnit: flat.AreaUnit,
                bedrooms: flat.Bedrooms,
                bathrooms: flat.Bathrooms,
                floor: flat.Floor,
                totalFloors: flat.TotalFloors,
                furnished: flat.Furnished,
                amenities: flat
            });

            const ratio = price / prediction.estimate;
            if (ratio <= 0.85) priceFairness = 'bargain';
            else if (ratio <= 1.1) priceFairness = 'fair';
            else priceFairness = 'above-market';

            if (priceFairness === 'bargain') { score += 8; reasons.push('priced below the model\'s estimate — good value'); }
            else if (priceFairness === 'above-market') { score -= 4; }
        }
    } catch (_) {
        // If we can't price it (e.g. missing area), just skip the fairness signal.
    }

    return { flat, score: Math.round(score), reasons, priceFairness };
}

module.exports = { suggestFlats };
