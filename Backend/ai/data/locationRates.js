/**
 * ============================================================
 * Bangladesh property price reference data
 * ============================================================
 *
 * These base rates are NOT scraped live from any single site.
 * They are a hand-compiled reference table built by aggregating
 * publicly published 2026 market figures for Dhaka, Chattogram,
 * Sylhet and other major Bangladeshi cities (sources include
 * property portals such as bproperty, bikroy, manshir, pbazaar,
 * jiji, and local market-report blogs, cross-checked against each
 * other). Figures are in Bangladeshi Taka (BDT).
 *
 *   saleRate = typical resale/purchase price per square foot
 *   rentRate = typical monthly rent per square foot
 *
 * These numbers are DELIBERATELY kept as (min, mid, max) ranges
 * rather than single points, because real listings in the same
 * neighbourhood commonly vary 2x depending on building age,
 * finish quality and floor. The price model (see priceModel.js)
 * uses `mid` as the anchor and lets bedrooms/bathrooms/floor/
 * furnishing/amenities pull the estimate up or down from there.
 *
 * This is reference/training data, not a live feed — it should be
 * refreshed periodically as the market moves. It is intentionally
 * kept in one small, readable file so it's easy to update by hand.
 */

function rate(saleMin, saleMax, rentMin, rentMax) {
    return {
        sale: { min: saleMin, max: saleMax, mid: Math.round((saleMin + saleMax) / 2) },
        rent: { min: rentMin, max: rentMax, mid: Math.round((rentMin + rentMax) / 2) }
    };
}

/**
 * Area-level rates. Keys are lower-cased, trimmed area/neighbourhood
 * names as an owner would typically type them into the "Area /
 * Neighbourhood" field. Matching is fuzzy (see matchArea below).
 */
const AREA_RATES = {

    // ---------------- Dhaka: premium ----------------
    'gulshan': rate(15000, 30000, 20, 38),
    'gulshan 1': rate(15000, 30000, 20, 38),
    'gulshan 2': rate(15000, 30000, 20, 38),
    'banani': rate(15000, 30000, 20, 38),
    'baridhara': rate(15000, 30000, 20, 36),
    'baridhara dohs': rate(14000, 26000, 18, 32),
    'niketan': rate(11000, 18000, 16, 26),

    // ---------------- Dhaka: upper-mid ----------------
    'dhanmondi': rate(14000, 30000, 18, 30),
    'bashundhara': rate(12000, 20000, 16, 28),
    'bashundhara r/a': rate(12000, 20000, 16, 28),
    'lalmatia': rate(12000, 19000, 16, 26),
    'eskaton': rate(10000, 16000, 14, 22),
    'kakrail': rate(9000, 15000, 13, 20),
    'segunbagicha': rate(9000, 15000, 13, 20),
    'mohakhali': rate(9000, 15000, 13, 22),
    'mohakhali dohs': rate(12000, 19000, 16, 24),

    // ---------------- Dhaka: mid ----------------
    'uttara': rate(9000, 16000, 13, 22),
    'uttara sector 1': rate(9500, 17000, 14, 22),
    'uttara sector 4': rate(9000, 16000, 13, 21),
    'uttara sector 10': rate(8500, 15000, 12, 20),
    'uttara sector 13': rate(8000, 14000, 11, 18),
    'banasree': rate(6500, 9500, 11, 16),
    'rampura': rate(6500, 9500, 11, 16),
    'malibagh': rate(7000, 10500, 11, 17),
    'khilgaon': rate(6500, 9500, 10, 16),
    'shantinagar': rate(8500, 13000, 12, 18),
    'shyamoli': rate(7500, 11000, 11, 17),
    'mohammadpur': rate(5000, 10000, 10, 16),
    'adabar': rate(5000, 9000, 9, 15),
    'mirpur': rate(5000, 10000, 10, 18),
    'mirpur 1': rate(4800, 9000, 9, 16),
    'mirpur 2': rate(5000, 9500, 10, 17),
    'mirpur 10': rate(5500, 10500, 11, 18),
    'mirpur 11': rate(5500, 10500, 11, 18),
    'mirpur 12': rate(5200, 10000, 10, 17),
    'mirpur dohs': rate(9000, 15000, 13, 20),
    'pallabi': rate(5000, 9000, 9, 15),
    'kazipara': rate(5500, 9500, 10, 16),
    'kallyanpur': rate(5500, 9500, 10, 16),

    // ---------------- Dhaka: affordable ----------------
    'badda': rate(4800, 8500, 9, 15),
    'north badda': rate(4800, 8500, 9, 15),
    'south badda': rate(4600, 8000, 8, 14),
    'basabo': rate(5000, 8000, 9, 14),
    'jatrabari': rate(4200, 6800, 7, 12),
    'demra': rate(4000, 6500, 7, 11),
    'sutrapur': rate(4500, 7500, 8, 13),
    'kotwali': rate(4500, 7500, 8, 13),
    'keraniganj': rate(4000, 7000, 7, 12),
    'savar': rate(4200, 7000, 7, 12),
    'tongi': rate(4200, 7200, 7, 13),
    'dakshinkhan': rate(4500, 7500, 7, 13),
    'uttarkhan': rate(4200, 7000, 7, 12),
    'khilkhet': rate(6500, 10500, 11, 17),
    'cantonment': rate(9000, 15000, 13, 20),
    'bosila': rate(5000, 8500, 9, 15),

    // ---------------- Chattogram ----------------
    'khulshi': rate(7000, 10000, 14, 18),
    'north khulshi': rate(7500, 10500, 14, 19),
    'south khulshi': rate(7000, 10000, 13, 18),
    'nasirabad': rate(7000, 10000, 14, 18),
    'nasirabad r/a': rate(7000, 10000, 14, 18),
    'panchlaish': rate(6500, 9000, 12, 16),
    'gec': rate(6500, 9000, 12, 17),
    'gec circle': rate(6500, 9000, 12, 17),
    'agrabad': rate(5500, 7500, 10, 14),
    'halishahar': rate(5000, 7500, 9, 13),
    'chawkbazar': rate(5000, 7000, 9, 13),
    'lalkhan bazar': rate(6000, 8500, 11, 15),
    'chandgaon': rate(4500, 6500, 8, 12),
    'bakalia': rate(4200, 6200, 7, 11),
    'pahartali': rate(4500, 6500, 8, 12),
    'double mooring': rate(4800, 7000, 8, 12),
    'patenga': rate(4200, 6200, 7, 11),
    'bayazid': rate(4500, 6500, 8, 12),
    'oxygen': rate(4200, 6000, 7, 11),
    'muradpur': rate(4800, 6800, 8, 12),

    // ---------------- Sylhet ----------------
    'zindabazar': rate(5000, 7000, 14, 20),
    'subid bazar': rate(5000, 7000, 14, 20),
    'shahjalal upashahar': rate(4800, 6800, 12, 18),
    'ambarkhana': rate(4500, 6500, 11, 16),
    'shibganj': rate(4200, 6000, 10, 15),
    'mirabazar': rate(4500, 6500, 11, 16),
    'shahporan': rate(4000, 5800, 9, 14),
    'humayun rashid chattar': rate(4000, 5800, 9, 14),
    'tilagor': rate(3800, 5500, 8, 13),

    // ---------------- Other divisional cities ----------------
    'rajshahi': rate(3800, 5800, 8, 13),
    'boalia': rate(4000, 6000, 8, 13),
    'khulna': rate(3800, 5600, 8, 12),
    'sonadanga': rate(4000, 6000, 9, 13),
    'barisal': rate(3400, 5000, 7, 11),
    'rangpur': rate(3200, 4600, 6, 10),
    'comilla': rate(3800, 5200, 7, 11),
    'mymensingh': rate(3800, 5200, 7, 11),
    'gazipur': rate(4800, 7500, 9, 14),
    'narayanganj': rate(4800, 7500, 9, 14),
    'bogra': rate(3400, 5000, 6, 10),
    'jessore': rate(3600, 5200, 7, 11),
    'coxs bazar': rate(5000, 9000, 10, 18),
    "cox's bazar": rate(5000, 9000, 10, 18)
};

/**
 * City-level fallback rates, used when the specific area/neighbourhood
 * typed by the owner isn't in AREA_RATES above.
 */
const CITY_RATES = {
    'dhaka': rate(7000, 14000, 12, 20),
    'chattogram': rate(5000, 7500, 9, 14),
    'chittagong': rate(5000, 7500, 9, 14),
    'sylhet': rate(4200, 6200, 10, 15),
    'rajshahi': rate(3800, 5800, 8, 13),
    'khulna': rate(3800, 5600, 8, 12),
    'barisal': rate(3400, 5000, 7, 11),
    'rangpur': rate(3200, 4600, 6, 10),
    'comilla': rate(3800, 5200, 7, 11),
    'cumilla': rate(3800, 5200, 7, 11),
    'mymensingh': rate(3800, 5200, 7, 11),
    'gazipur': rate(4800, 7500, 9, 14),
    'narayanganj': rate(4800, 7500, 9, 14),
    'bogra': rate(3400, 5000, 6, 10),
    'bogura': rate(3400, 5000, 6, 10)
};

/** Used when neither the area nor the city is recognised at all. */
const NATIONAL_DEFAULT = rate(3800, 6000, 7, 12);

function normalize(text) {
    return String(text || '')
        .toLowerCase()
        .trim()
        .replace(/[.,]/g, '')
        .replace(/\s+/g, ' ');
}

/**
 * Look up the best-matching base rate for a given city/area pair.
 * Falls back city -> national default if no area-level match is found.
 * Returns { sale:{min,mid,max}, rent:{min,mid,max}, matchedOn, matchedKey }
 */
function matchArea(city, areaName) {
    const normalizedArea = normalize(areaName);
    const normalizedCity = normalize(city);

    // 1. Exact area match
    if (normalizedArea && AREA_RATES[normalizedArea]) {
        return { ...AREA_RATES[normalizedArea], matchedOn: 'area', matchedKey: normalizedArea };
    }

    // 2. Partial / contains match (e.g. "Gulshan 2, Dhaka" -> "gulshan")
    if (normalizedArea) {
        const areaKeys = Object.keys(AREA_RATES);
        const partial = areaKeys.find(key =>
            normalizedArea.includes(key) || key.includes(normalizedArea)
        );
        if (partial) {
            return { ...AREA_RATES[partial], matchedOn: 'area-partial', matchedKey: partial };
        }
    }

    // 3. City-level fallback
    if (normalizedCity && CITY_RATES[normalizedCity]) {
        return { ...CITY_RATES[normalizedCity], matchedOn: 'city', matchedKey: normalizedCity };
    }

    if (normalizedCity) {
        const cityKeys = Object.keys(CITY_RATES);
        const partial = cityKeys.find(key =>
            normalizedCity.includes(key) || key.includes(normalizedCity)
        );
        if (partial) {
            return { ...CITY_RATES[partial], matchedOn: 'city-partial', matchedKey: partial };
        }
    }

    // 4. National default
    return { ...NATIONAL_DEFAULT, matchedOn: 'national-default', matchedKey: 'bangladesh' };
}

module.exports = {
    AREA_RATES,
    CITY_RATES,
    NATIONAL_DEFAULT,
    normalize,
    matchArea
};
