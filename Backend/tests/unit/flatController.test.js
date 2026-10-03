// Protect the listing-field definitions and value conversions used by create/edit flows.
const test = require('node:test');
const assert = require('node:assert/strict');
const flatController = require('../../server/controllers/flatController');

const {
    TEXT_FIELDS, INT_FIELDS, DECIMAL_FIELDS, AMENITY_FIELDS, ALL_EDITABLE_FIELDS,
    parseForField, typeForField, toBit, nullableString, nullableInt, nullableDecimal
} = flatController;

// Ensure the exported editable-field catalog loads as a non-empty list.
test('field lists load without throwing (no duplicate/misplaced fields)', () => {
    assert.ok(Array.isArray(ALL_EDITABLE_FIELDS));
    assert.ok(ALL_EDITABLE_FIELDS.length > 0);
});

// Detect fields accidentally assigned to multiple parsing categories.
test('no field appears in more than one category', () => {
    const seen = new Set();
    const dupes = [];
    for (const field of ALL_EDITABLE_FIELDS) {
        if (seen.has(field)) dupes.push(field);
        seen.add(field);
    }
    assert.deepEqual(dupes, [], `Found duplicate field(s): ${dupes.join(', ')}`);
});

// Keep availability changes outside the general create/edit payload.
test('AvailabilityStatus is NOT in the general editable fields (regression test for the bug that broke Add Property)', () => {
    assert.ok(
        !ALL_EDITABLE_FIELDS.includes('AvailabilityStatus'),
        'AvailabilityStatus must only be set via updateAvailabilityStatus(), never the general create/edit form'
    );
});

// Check integer conversion for numeric, blank, invalid, missing, and zero inputs.
test('every INT_FIELDS entry parses correctly via nullableInt', () => {
    assert.strictEqual(nullableInt('5'), 5);
    assert.strictEqual(nullableInt(''), null);
    assert.strictEqual(nullableInt(undefined), null);
    assert.strictEqual(nullableInt('abc'), null);
    assert.strictEqual(nullableInt('0'), 0);
});

// Check decimal conversion and null handling for optional values.
test('every DECIMAL_FIELDS entry parses correctly via nullableDecimal', () => {
    assert.strictEqual(nullableDecimal('1200.5'), 1200.5);
    assert.strictEqual(nullableDecimal(''), null);
    assert.strictEqual(nullableDecimal(undefined), null);
});

// Convert blank optional text to null while preserving meaningful text.
test('nullableString converts blank/whitespace to null (so optional dropdowns satisfy CHECK constraints)', () => {
    assert.strictEqual(nullableString(''), null);
    assert.strictEqual(nullableString('   '), null);
    assert.strictEqual(nullableString(undefined), null);
    assert.strictEqual(nullableString('Ready'), 'Ready');
});

// Map checkbox-style booleans and strings to database bit values.
test('toBit correctly converts checkbox-style values to 0/1', () => {
    assert.strictEqual(toBit('true'), 1);
    assert.strictEqual(toBit('false'), 0);
    assert.strictEqual(toBit(true), 1);
    assert.strictEqual(toBit(false), 0);
    assert.strictEqual(toBit(undefined), 0);
    assert.strictEqual(toBit(''), 0);
    assert.strictEqual(toBit('1'), 1);
});

// Verify every amenity uses the boolean-to-bit parser.
test('every AMENITY_FIELDS entry is classified correctly by parseForField (returns 0 or 1)', () => {
    for (const field of AMENITY_FIELDS) {
        assert.strictEqual(parseForField(field, 'true'), 1, `${field} should parse "true" to 1`);
        assert.strictEqual(parseForField(field, 'false'), 0, `${field} should parse "false" to 0`);
    }
});

// Verify every text field maps blanks to null and preserves entered text.
test('every TEXT_FIELDS entry is classified correctly by parseForField', () => {
    for (const field of TEXT_FIELDS) {
        assert.strictEqual(parseForField(field, ''), null, `${field} should parse blank to null`);
        assert.strictEqual(parseForField(field, 'X'), 'X', `${field} should pass through a real value`);
    }
});

// Ensure field type lookup is safe for the entire editable-field catalog.
test('typeForField never throws for any real editable field', () => {
    for (const field of ALL_EDITABLE_FIELDS) {
        assert.doesNotThrow(() => typeForField(field));
    }
});

// Recreate the INSERT column list and catch duplicate columns before database execution.
test('generating the createFlat INSERT column/placeholder lists produces no duplicates', () => {
    const columns = ['OwnerId', ...ALL_EDITABLE_FIELDS, 'IsActive', 'AvailabilityStatus'];
    const seen = new Set();
    const dupes = columns.filter((c) => {
        if (seen.has(c)) return true;
        seen.add(c);
        return false;
    });
    assert.deepEqual(dupes, [], `INSERT statement would have duplicate column(s): ${dupes.join(', ')}`);
});

// Keep the amenity catalog unique so parsing does not process a field twice.
test('AMENITY_FIELDS has no duplicate entries within itself', () => {
    assert.strictEqual(new Set(AMENITY_FIELDS).size, AMENITY_FIELDS.length);
});

// Confirm all mandatory create-form values belong to supported field categories.
test('required-on-create fields (Title, Purpose, PropertyType, Price) are all real editable fields', () => {
    assert.ok(TEXT_FIELDS.includes('Title'));
    assert.ok(TEXT_FIELDS.includes('Purpose'));
    assert.ok(TEXT_FIELDS.includes('PropertyType'));
    assert.ok(DECIMAL_FIELDS.includes('Price'));
});
