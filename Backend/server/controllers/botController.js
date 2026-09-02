const { executeSql, sql } = require('../db');
const priceModel = require('../../ai/priceModel');
const { suggestFlats } = require('../../ai/recommendEngine');
const { AREA_RATES, CITY_RATES } = require('../../ai/data/locationRates');

const PURPOSES = ['Rent', 'Sale'];
const PROPERTY_TYPES = ['Apartment', 'Duplex', 'Penthouse', 'Studio', 'House', 'Villa', 'Office', 'Shop', 'Building', 'Other'];
const AREA_UNITS = ['sq ft', 'sq m', 'katha', 'decimal'];
const FURNISHED_OPTIONS = ['Unfurnished', 'Semi-furnished', 'Fully furnished'];

function clean(value, max) {
    return String(value ?? '').trim().slice(0, max);
}

function toNumberOrNull(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/** Whitelists an incoming amenities payload down to real amenity columns only. */
function sanitizeAmenities(amenities) {
    const clean = {};
    if (Array.isArray(amenities)) {
        for (const key of amenities) {
            if (priceModel.AMENITY_COLUMNS.includes(key)) clean[key] = true;
        }
    } else if (amenities && typeof amenities === 'object') {
        for (const key of priceModel.AMENITY_COLUMNS) {
            if (amenities[key]) clean[key] = true;
        }
    }
    return clean;
}


/* ============================================================
   GET /api/bot/meta
   Static reference data the frontend chat widget uses to build
   its quick-reply chips (known areas, property types, etc).
============================================================ */

function getMeta(req, res) {
    return res.json({
        success: true,
        purposes: PURPOSES,
        propertyTypes: PROPERTY_TYPES,
        areaUnits: AREA_UNITS,
        furnishedOptions: FURNISHED_OPTIONS,
        amenities: priceModel.AMENITY_COLUMNS,
        knownAreas: Object.keys(AREA_RATES),
        knownCities: Object.keys(CITY_RATES)
    });
}


/* ============================================================
   POST /api/bot/price-suggest
   Owner-only: suggests a fair rent/sale price for a property
   based on location, size and features.
============================================================ */

async function priceSuggest(req, res) {
    try {
        const purpose = clean(req.body.purpose, 20);
        const city = clean(req.body.city, 100);
        const areaName = clean(req.body.areaName, 200);
        const propertyType = clean(req.body.propertyType, 50) || 'Apartment';
        const area = toNumberOrNull(req.body.area);
        const areaUnit = clean(req.body.areaUnit, 10) || 'sq ft';
        const bedrooms = toNumberOrNull(req.body.bedrooms);
        const bathrooms = toNumberOrNull(req.body.bathrooms);
        const floor = toNumberOrNull(req.body.floor);
        const totalFloors = toNumberOrNull(req.body.totalFloors);
        const furnished = clean(req.body.furnished, 20);
        const amenities = sanitizeAmenities(req.body.amenities);

        if (!PURPOSES.includes(purpose)) {
            return res.status(400).json({ success: false, error: 'Purpose must be "Rent" or "Sale".' });
        }

        if (!city && !areaName) {
            return res.status(400).json({ success: false, error: 'Please provide at least a city or area/neighbourhood.' });
        }

        if (!area || area <= 0) {
            return res.status(400).json({ success: false, error: 'Please provide a valid property size.' });
        }

        if (!AREA_UNITS.includes(areaUnit)) {
            return res.status(400).json({ success: false, error: 'Invalid area unit.' });
        }

        const suggestion = priceModel.predictPrice({
            purpose, city, areaName, propertyType, area, areaUnit,
            bedrooms, bathrooms, floor, totalFloors, furnished, amenities
        });

        // Pull a few real comparable listings for reassurance/context.
        const comparableConditions = ["IsActive = 1"];
        const comparableParams = [];

        if (areaName) {
            comparableConditions.push('AreaName LIKE @area');
            comparableParams.push({ name: 'area', type: sql.NVarChar(200), value: `%${areaName}%` });
        } else if (city) {
            comparableConditions.push('City LIKE @city');
            comparableParams.push({ name: 'city', type: sql.NVarChar(100), value: `%${city}%` });
        }

        comparableConditions.push("(Purpose = @purpose OR Purpose = 'Rent & Sale')");
        comparableParams.push({ name: 'purpose', type: sql.NVarChar(20), value: purpose });

        const comparables = await executeSql(
            `
            SELECT Id, Title, Price, Area, AreaUnit, Bedrooms, Bathrooms, AreaName, City
            FROM dbo.Flats
            WHERE ${comparableConditions.join(' AND ')}
            ORDER BY CreatedAt DESC
            LIMIT 4;
            `,
            comparableParams
        );

        return res.json({ success: true, suggestion, comparables });

    } catch (error) {
        console.error('Bot price-suggest error:', error);
        const status = error.statusCode || 500;
        return res.status(status).json({
            success: false,
            error: status === 400 ? error.message : 'Could not generate a price suggestion right now. Please try again later.'
        });
    }
}


/* ============================================================
   POST /api/bot/suggest-flats
   Available to both Users and Owners: recommends active listings
   that best match the given criteria.
============================================================ */

async function findFlats(req, res) {
    try {
        const purpose = clean(req.body.purpose, 20) || 'Any';
        const city = clean(req.body.city, 100);
        const areaName = clean(req.body.areaName, 200);
        const propertyType = clean(req.body.propertyType, 50) || 'Any';
        const budgetMax = toNumberOrNull(req.body.budgetMax);
        const budgetMin = toNumberOrNull(req.body.budgetMin);
        const bedrooms = toNumberOrNull(req.body.bedrooms);
        const minArea = toNumberOrNull(req.body.minArea);
        const maxArea = toNumberOrNull(req.body.maxArea);
        const amenities = Array.isArray(req.body.amenities)
            ? req.body.amenities.filter(a => priceModel.AMENITY_COLUMNS.includes(a))
            : [];

        const { results, candidateCount } = await suggestFlats({
            purpose, city, areaName, propertyType,
            budgetMax, budgetMin, bedrooms, minArea, maxArea,
            amenities, limit: 5
        });

        return res.json({
            success: true,
            candidateCount,
            results: results.map(r => ({
                flat: r.flat,
                score: r.score,
                reasons: r.reasons,
                priceFairness: r.priceFairness
            }))
        });

    } catch (error) {
        console.error('Bot find-flats error:', error);
        return res.status(500).json({
            success: false,
            error: 'Could not search for matching flats right now. Please try again later.'
        });
    }
}

module.exports = { getMeta, priceSuggest, findFlats };
