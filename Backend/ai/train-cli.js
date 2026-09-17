/**
 * Manually (re)trains the FlatMate price model and prints a summary.
 * Usage:  npm run train:price-model
 *
 * Useful after the location rate data (ai/data/locationRates.js) is
 * updated, or any time you want the model to pick up newly added real
 * listings from the database immediately rather than waiting for the
 * next server restart.
 */

require('dotenv').config();
const { train } = require('./priceModel');

(async () => {
    console.log('Training FlatMate price model...\n');

    const model = await train();

    console.log('✓ Done.');
    console.log(`  Trained at:        ${model.trainedAt}`);
    console.log(`  Real sale rows:    ${model.realListingsUsed.sale}`);
    console.log(`  Real rent rows:    ${model.realListingsUsed.rent}`);
    console.log(`  Saved to:          ai/model/trained-weights.json\n`);

    console.log('Sale coefficients:', JSON.stringify(
        Object.fromEntries(model.featureNames.map((name, i) => [name, Number(model.weights.sale[i].toFixed(4))]))
    ));
    console.log('Rent coefficients:', JSON.stringify(
        Object.fromEntries(model.featureNames.map((name, i) => [name, Number(model.weights.rent[i].toFixed(4))]))
    ));

    process.exit(0);
})().catch((error) => {
    console.error('✗ Training failed:', error);
    process.exit(1);
});
