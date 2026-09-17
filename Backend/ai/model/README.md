# Trained Bangladesh RF model

FlatMate can run the RandomForestRegressor trained by `RealStatePricePrediction.ipynb`
directly in Node when `rf-model.json` is present in this folder.

The notebook currently saves these files to `bangladesh_property_ai`:

- `rf_model.pkl`
- `label_encoders.pkl`
- `feature_cols.pkl`

Because the website ZIP does not contain the private Google Drive model artifacts,
the export is intentionally a separate step:

```bash
python Backend/ai/export-rf-model.py /path/to/bangladesh_property_ai Backend/ai/model
```

After `rf-model.json` exists, FlatMate automatically prefers that trained RF model.
If it is absent, the existing built-in Bangladesh valuation model remains available,
so the website does not fail to start.
