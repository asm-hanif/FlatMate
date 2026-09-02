/**
 * ============================================================
 * FlatMate Price Advisor — hedonic regression price model
 * ============================================================
 *
 * WHAT THIS IS
 * A small, fully self-contained "AI" pricing model — a multiple
 * linear regression fitted with the normal-equation method (pure
 * JS, no native/ML dependency). It predicts price-per-square-foot
 * as a location base rate (see ai/data/locationRates.js) adjusted
 * by a set of learned coefficients for bedrooms, bathrooms, floor
 * position, furnishing and amenity count. This is the standard
 * "hedonic pricing" approach real-world Automated Valuation Models
 * (AVMs) use.
 *
 * WHY REGRESSION ON GENERATED DATA
 * FlatMate does not have access to a licensed feed of thousands of
 * real historical Bangladeshi transactions. What it *does* have is
 * (a) published 2026 per-square-foot rate ranges for dozens of
 * Dhaka/Chattogram/Sylhet/etc. neighbourhoods (ai/data/locationRates.js)
 * and (b) domain knowledge of how bedrooms/furnishing/floor/amenities
 * typically move price within a neighbourhood. train() combines both:
 * it simulates a large, realistic sample of listings per area using
 * that domain knowledge plus noise, and fits a regression to it. This
 * is a common, honest way to bootstrap a valuation model before real
 * transaction volume exists.
 *
 * GETTING BETTER OVER TIME
 * If FlatMate's own database has enough real listings, train() also
 * pulls them in as extra (higher-weight) training rows — see
 * loadRealListings() below — so the model organically improves as
 * more owners list real properties on the platform. This requires no
 * external AI/API service and runs entirely offline inside Node.
 */

const fs = require('fs');
const path = require('path');
const { matchArea } = require('./data/locationRates');

const WEIGHTS_PATH = path.join(__dirname, 'model', 'trained-weights.json');

// Feature order used by every model (sale + rent). Keep in sync
// between buildFeatureRow() and any manual weight inspection.
const FEATURE_NAMES = [
    'bias',
    'logAreaK',        // log(area in thousands of sqft) — captures size premium/discount
    'bedrooms',
    'bathrooms',
    'floorRatio',       // floor / totalFloors, centered at 0.5
    'furnishedScore',   // 0 = unfurnished, 1 = semi-furnished, 2 = fully furnished
    'amenityScore'      // amenity count / 10
];

const FURNISHED_SCORE = {
    'unfurnished': 0,
    'semi-furnished': 1,
    'semi furnished': 1,
    'fully furnished': 2
};

const AMENITY_COLUMNS = [
    'Parking', 'CoveredParking', 'Balconies', 'Lift', 'Security', 'CCTV', 'Guard',
    'Generator', 'Water', 'Gas', 'Electricity', 'Internet', 'CableTV',
    'AirConditioning', 'Heating', 'SwimmingPool', 'Gym', 'CommunityHall',
    'Rooftop', 'Garden', 'Playground', 'PetFriendly', 'Laundry',
    'MosquePrayerRoom', 'FireExit', 'WASAConnection', 'SelfWaterSupply',
    'HotWater', 'CylinderGas', 'TelephoneLine', 'Intercom',
    'WifiConnectivity', 'SecurityAlarmSystem', 'ElectronicSecurity',
    'SolarPanels', 'GuestParking', 'ServantQuarter', 'ServantToilet',
    'FireProtection', 'DepartmentalStore'
];

// Property types get a small, hand-set multiplicative prior rather than
// their own regression coefficient (there isn't enough independent
// variation to learn this reliably from a simulated dataset).
const PROPERTY_TYPE_MULTIPLIER = {
    'penthouse': 1.15,
    'duplex': 1.08,
    'villa': 1.12,
    'house': 1.0,
    'apartment': 1.0,
    'studio': 0.95,
    'building': 1.0,
    'office': 0.92,
    'shop': 0.88,
    'other': 1.0
};

const AREA_UNIT_TO_SQFT = {
    'sq ft': 1,
    'sq m': 10.7639,
    'katha': 720,
    'decimal': 435.6
};


/* ============================================================
   LINEAR ALGEBRA (pure JS — normal equations w/ ridge term)
============================================================ */

function transpose(matrix) {
    return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
}

function multiplyMatrices(a, b) {
    const result = [];
    for (let i = 0; i < a.length; i++) {
        result.push(new Array(b[0].length).fill(0));
        for (let j = 0; j < b[0].length; j++) {
            let sum = 0;
            for (let k = 0; k < b.length; k++) sum += a[i][k] * b[k][j];
            result[i][j] = sum;
        }
    }
    return result;
}

function multiplyMatrixVector(matrix, vector) {
    return matrix.map(row => row.reduce((sum, value, i) => sum + value * vector[i], 0));
}

/** Solves Ax = b via Gaussian elimination with partial pivoting. */
function solveLinearSystem(A, b) {
    const n = A.length;
    const M = A.map((row, i) => [...row, b[i]]);

    for (let col = 0; col < n; col++) {
        let pivotRow = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(M[row][col]) > Math.abs(M[pivotRow][col])) pivotRow = row;
        }
        [M[col], M[pivotRow]] = [M[pivotRow], M[col]];

        if (Math.abs(M[col][col]) < 1e-10) continue; // singular-ish; skip (ridge term prevents this in practice)

        for (let row = 0; row < n; row++) {
            if (row === col) continue;
            const factor = M[row][col] / M[col][col];
            for (let k = col; k <= n; k++) M[row][k] -= factor * M[col][k];
        }
    }

    return M.map((row, i) => (Math.abs(row[i]) < 1e-10 ? 0 : row[n] / row[i]));
}

/** Ridge-regularised least squares: w = (XtX + lambda*I)^-1 Xt y */
function trainLinearRegression(X, y, lambda = 0.5) {
    const Xt = transpose(X);
    const XtX = multiplyMatrices(Xt, X);
    const Xty = multiplyMatrixVector(Xt, y);

    for (let i = 1; i < XtX.length; i++) XtX[i][i] += lambda; // don't regularize bias

    return solveLinearSystem(XtX, Xty);
}


/* ============================================================
   FEATURE ENGINEERING
============================================================ */

function toSqft(area, areaUnit) {
    const factor = AREA_UNIT_TO_SQFT[String(areaUnit || 'sq ft').toLowerCase()] || 1;
    return Number(area) * factor;
}

function furnishedScoreOf(value) {
    const key = String(value || '').toLowerCase().trim();
    return FURNISHED_SCORE[key] ?? 0;
}

function propertyTypeMultiplierOf(value) {
    const key = String(value || '').toLowerCase().trim();
    return PROPERTY_TYPE_MULTIPLIER[key] ?? 1.0;
}

function countAmenities(flatLike) {
    return AMENITY_COLUMNS.reduce((count, col) => count + (flatLike[col] ? 1 : 0), 0);
}

function buildFeatureRow({ areaSqft, bedrooms, bathrooms, floor, totalFloors, furnishedScore, amenityCount }) {
    const logAreaK = Math.log(Math.max(areaSqft, 100) / 1000);
    const floorRatio = totalFloors && totalFloors > 0
        ? Math.min(Math.max((floor || 1) / totalFloors, 0), 1) - 0.5
        : 0;

    return [
        1,                              // bias
        logAreaK,
        Math.max(bedrooms || 0, 0),
        Math.max(bathrooms || 0, 0),
        floorRatio,
        furnishedScore || 0,
        (amenityCount || 0) / 10
    ];
}


/* ============================================================
   SYNTHETIC TRAINING DATA (grounded in researched base rates)
============================================================ */

function mulberry32(seed) {
    // Small deterministic PRNG so training is reproducible between runs.
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function gaussianNoise(rand, stdDev) {
    const u1 = Math.max(rand(), 1e-9);
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * stdDev;
}

/**
 * Generates a realistic simulated listing sample for one area, for
 * either 'sale' or 'rent'. The "true" relationship baked in here
 * (size discount, bedroom/bathroom/floor/furnishing/amenity premiums)
 * reflects standard real-estate pricing behaviour; regression later
 * re-discovers approximately these same coefficients from noisy
 * samples, plus blends in any real FlatMate listings available.
 */
function simulateListing(rand, baseRateMid, purpose) {
    const areaSqft = 450 + rand() * 3350; // 450 - 3800 sqft
    const impliedBedrooms = Math.min(Math.max(Math.round(areaSqft / 500), 1), 6);
    const bedrooms = Math.max(1, Math.round(impliedBedrooms + gaussianNoise(rand, 0.6)));
    const bathrooms = Math.max(1, Math.round(bedrooms + gaussianNoise(rand, 0.5) - 0.3));
    const totalFloors = Math.round(4 + rand() * 11);
    const floor = Math.max(1, Math.round(rand() * totalFloors));
    const furnishedScore = Math.round(rand() * 2);
    const amenityCount = Math.round(rand() * 15);

    const features = buildFeatureRow({
        areaSqft, bedrooms, bathrooms, floor, totalFloors, furnishedScore, amenityCount
    });

    // Hand-set "true" generative coefficients (domain knowledge anchor).
    const trueWeights = {
        bias: 0,
        logAreaK: -0.14,     // larger units cost a bit less per sqft
        bedrooms: 0.015,
        bathrooms: 0.012,
        floorRatio: 0.08,    // higher floor (as a fraction of the building) => modest premium
        furnishedScore: purpose === 'rent' ? 0.07 : 0.04, // furnishing matters more for rent pricing
        amenityScore: 0.05
    };

    const trueLogMultiplier =
        features[1] * trueWeights.logAreaK +
        features[2] * trueWeights.bedrooms +
        features[3] * trueWeights.bathrooms +
        features[4] * trueWeights.floorRatio +
        features[5] * trueWeights.furnishedScore +
        features[6] * trueWeights.amenityScore +
        gaussianNoise(rand, 0.07); // market noise

    const pricePerSqft = baseRateMid * Math.exp(trueLogMultiplier);

    return { features, pricePerSqft, areaSqft };
}

function generateSyntheticTrainingSet(areaRatesModule, purpose, samplesPerArea = 30) {
    const rand = mulberry32(purpose === 'rent' ? 20260101 : 20260102);
    const rows = [];

    const allAreaKeys = Object.keys(areaRatesModule.AREA_RATES);
    for (const key of allAreaKeys) {
        const rates = areaRatesModule.AREA_RATES[key];
        const baseRateMid = purpose === 'rent' ? rates.rent.mid : rates.sale.mid;

        for (let i = 0; i < samplesPerArea; i++) {
            const { features, pricePerSqft } = simulateListing(rand, baseRateMid, purpose);
            rows.push({ features, y: Math.log(pricePerSqft / baseRateMid) });
        }
    }

    return rows;
}


/* ============================================================
   OPTIONAL: LEARN FROM REAL FLATMATE LISTINGS
============================================================ */

/**
 * Pulls active listings out of FlatMate's own database (if reachable)
 * and turns them into extra training rows, weighted more heavily than
 * the synthetic rows since they're real observed prices. Silently
 * returns an empty array if the DB isn't reachable — training always
 * falls back gracefully to the synthetic dataset alone.
 */
async function loadRealListingRows(purpose) {
    try {
        const { executeSql, sql } = require('../server/db');

        const purposeFilter = purpose === 'rent'
            ? "Purpose IN ('Rent', 'Rent & Sale')"
            : "Purpose IN ('Sale', 'Rent & Sale')";

        const flats = await executeSql(`
            SELECT *
            FROM dbo.Flats
            WHERE IsActive = 1 AND Area IS NOT NULL AND Area > 0 AND ${purposeFilter};
        `);

        const { matchArea: matchAreaFn } = require('./data/locationRates');

        return flats
            .map(flat => {
                const areaSqft = toSqft(flat.Area, flat.AreaUnit);
                if (!areaSqft || areaSqft < 100) return null;

                const pricePerSqft = Number(flat.Price) / areaSqft;
                if (!isFinite(pricePerSqft) || pricePerSqft <= 0) return null;

                const rateInfo = matchAreaFn(flat.City, flat.AreaName);
                const baseRateMid = purpose === 'rent' ? rateInfo.rent.mid : rateInfo.sale.mid;

                const features = buildFeatureRow({
                    areaSqft,
                    bedrooms: flat.Bedrooms,
                    bathrooms: flat.Bathrooms,
                    floor: flat.Floor,
                    totalFloors: flat.TotalFloors,
                    furnishedScore: furnishedScoreOf(flat.Furnished),
                    amenityCount: countAmenities(flat)
                });

                const ratio = pricePerSqft / baseRateMid;
                // Guard against wildly mis-entered listings skewing the model.
                if (ratio < 0.15 || ratio > 6) return null;

                return { features, y: Math.log(ratio), weight: 4 };
            })
            .filter(Boolean);

    } catch (error) {
        console.warn('⚠ Price model: could not load real listings for training (using simulated data only):', error.message);
        return [];
    }
}


/* ============================================================
   TRAIN / SAVE / LOAD
============================================================ */

function fitModel(rows) {
    // Expand weighted rows by repetition (simple, robust way to weight
    // ordinary least squares without a full WLS implementation).
    const expanded = [];
    for (const row of rows) {
        const repeat = row.weight || 1;
        for (let i = 0; i < repeat; i++) expanded.push(row);
    }

    const X = expanded.map(r => r.features);
    const y = expanded.map(r => r.y);
    return trainLinearRegression(X, y);
}

async function train({ useRealListings = true } = {}) {
    const areaRatesModule = require('./data/locationRates');

    const saleRows = generateSyntheticTrainingSet(areaRatesModule, 'sale');
    const rentRows = generateSyntheticTrainingSet(areaRatesModule, 'rent');

    let realSaleRows = [];
    let realRentRows = [];

    if (useRealListings) {
        realSaleRows = await loadRealListingRows('sale');
        realRentRows = await loadRealListingRows('rent');
    }

    const saleWeights = fitModel([...saleRows, ...realSaleRows]);
    const rentWeights = fitModel([...rentRows, ...realRentRows]);

    const model = {
        trainedAt: new Date().toISOString(),
        featureNames: FEATURE_NAMES,
        realListingsUsed: { sale: realSaleRows.length, rent: realRentRows.length },
        weights: { sale: saleWeights, rent: rentWeights }
    };

    fs.mkdirSync(path.dirname(WEIGHTS_PATH), { recursive: true });
    fs.writeFileSync(WEIGHTS_PATH, JSON.stringify(model, null, 2));

    return model;
}

let cachedModel = null;

function loadModel() {
    if (cachedModel) return cachedModel;

    if (fs.existsSync(WEIGHTS_PATH)) {
        cachedModel = JSON.parse(fs.readFileSync(WEIGHTS_PATH, 'utf8'));
        return cachedModel;
    }

    return null;
}

/**
 * Ensures a trained model exists in memory, training one (synchronously
 * blocking, but this only takes tens of milliseconds) if needed. Called
 * once at server startup.
 */
async function ensureModelReady() {
    if (loadModel()) return cachedModel;

    console.log('→ Training FlatMate price model (first run)...');
    cachedModel = await train();
    console.log(
        `✓ Price model trained (blended in ${cachedModel.realListingsUsed.sale} real sale + ` +
        `${cachedModel.realListingsUsed.rent} real rent listings from the database).`
    );
    return cachedModel;
}


/* ============================================================
   INFERENCE
============================================================ */

/**
 * Predicts a fair price for a property.
 *
 * @param {object} input
 *   purpose: 'Rent' | 'Sale' | 'Rent & Sale'
 *   city, areaName: strings
 *   propertyType: string
 *   area, areaUnit: numbers/strings describing size
 *   bedrooms, bathrooms, floor, totalFloors: numbers
 *   furnished: 'Unfurnished' | 'Semi-furnished' | 'Fully furnished'
 *   amenities: { Parking: true, ... } (boolean flags matching AMENITY_COLUMNS)
 *
 * @returns { pricePerSqft, estimate, low, high, currency, basis, explanation }
 */
function predictPrice(input) {
    const model = loadModel();
    if (!model) {
        throw new Error('Price model is not trained yet. Call ensureModelReady() at startup first.');
    }

    const rawPurpose = String(input.purpose || 'Rent').toLowerCase();
    const purpose = rawPurpose.includes('sale') && !rawPurpose.includes('rent')
        ? 'sale'
        : rawPurpose === 'sale'
            ? 'sale'
            : 'rent';

    const areaSqft = toSqft(input.area, input.areaUnit);
    if (!areaSqft || areaSqft < 100) {
        const err = new Error('A valid property size is required (at least 100 sq ft).');
        err.statusCode = 400;
        throw err;
    }

    const rateInfo = matchArea(input.city, input.areaName);
    const baseRateMid = purpose === 'rent' ? rateInfo.rent.mid : rateInfo.sale.mid;
    const baseRateMin = purpose === 'rent' ? rateInfo.rent.min : rateInfo.sale.min;
    const baseRateMax = purpose === 'rent' ? rateInfo.rent.max : rateInfo.sale.max;

    const furnishedScore = furnishedScoreOf(input.furnished);
    const amenityCount = AMENITY_COLUMNS.reduce(
        (count, col) => count + (input.amenities && input.amenities[col] ? 1 : 0),
        0
    );

    const features = buildFeatureRow({
        areaSqft,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        floor: input.floor,
        totalFloors: input.totalFloors,
        furnishedScore,
        amenityCount
    });

    const weights = model.weights[purpose];
    const logMultiplier = features.reduce((sum, value, i) => sum + value * weights[i], 0);

    // Clamp the learned multiplier to a sane band so a weird input
    // combination can't produce an absurd price.
    const clampedMultiplier = Math.exp(Math.min(Math.max(logMultiplier, -0.6), 0.9));

    const propertyTypeMultiplier = propertyTypeMultiplierOf(input.propertyType);

    const predictedRatePerSqft = baseRateMid * clampedMultiplier * propertyTypeMultiplier;
    const lowRatePerSqft = baseRateMin * clampedMultiplier * propertyTypeMultiplier;
    const highRatePerSqft = baseRateMax * clampedMultiplier * propertyTypeMultiplier;

    const estimate = Math.round(predictedRatePerSqft * areaSqft);
    const low = Math.round(lowRatePerSqft * areaSqft);
    const high = Math.round(highRatePerSqft * areaSqft);

    return {
        purpose: purpose === 'rent' ? 'Rent' : 'Sale',
        currency: 'BDT',
        period: purpose === 'rent' ? 'per month' : 'one-time',
        areaSqft: Math.round(areaSqft),
        pricePerSqft: Math.round(predictedRatePerSqft),
        estimate,
        low,
        high,
        locationMatch: {
            matchedOn: rateInfo.matchedOn,
            matchedKey: rateInfo.matchedKey
        },
        modelTrainedAt: model.trainedAt,
        explanation: buildExplanation({
            rateInfo, purpose, furnishedScore, amenityCount, propertyTypeMultiplier, clampedMultiplier
        })
    };
}

function buildExplanation({ rateInfo, purpose, furnishedScore, amenityCount, propertyTypeMultiplier, clampedMultiplier }) {
    const bits = [];

    if (rateInfo.matchedOn === 'area' || rateInfo.matchedOn === 'area-partial') {
        bits.push(`Based on typical ${purpose} rates for this neighbourhood.`);
    } else if (rateInfo.matchedOn === 'city' || rateInfo.matchedOn === 'city-partial') {
        bits.push(`This specific area isn't in our reference data yet, so this uses the city-wide average for ${purpose === 'rent' ? 'renting' : 'buying'} instead.`);
    } else {
        bits.push(`This city/area isn't in our reference data yet, so this uses a general Bangladesh average — treat it as a rough starting point.`);
    }

    if (furnishedScore === 2) bits.push('Fully-furnished condition adds to the estimate.');
    else if (furnishedScore === 0) bits.push('Unfurnished condition is factored in.');

    if (amenityCount >= 8) bits.push('A strong amenity list (parking, lift, security, etc.) pushes the estimate up.');
    else if (amenityCount <= 2) bits.push('Few listed amenities keep the estimate conservative.');

    if (propertyTypeMultiplier > 1.02) bits.push('Property type carries a premium in the local market.');
    else if (propertyTypeMultiplier < 0.98) bits.push('Property type typically prices a bit below standard apartments.');

    if (clampedMultiplier >= 1.1) bits.push('Overall, these features are above-average for the area.');
    else if (clampedMultiplier <= 0.92) bits.push('Overall, these features are modest for the area, which keeps the estimate on the lower side.');

    return bits.join(' ');
}

module.exports = {
    train,
    ensureModelReady,
    loadModel,
    predictPrice,
    toSqft,
    furnishedScoreOf,
    countAmenities,
    AMENITY_COLUMNS,
    FEATURE_NAMES
};
