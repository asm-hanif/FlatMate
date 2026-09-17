"""
Export the scikit-learn RandomForestRegressor produced by
RealStatePricePrediction.ipynb into a compact JSON tree representation that
FlatMate can run without Python at request time.

Expected files (copied from the notebook's bangladesh_property_ai folder):
  rf_model.pkl
  label_encoders.pkl
  feature_cols.pkl

Usage:
  python export-rf-model.py /path/to/bangladesh_property_ai Backend/ai/model
"""
import json
import os
import sys
import joblib


def main():
    if len(sys.argv) < 2:
        print('Usage: python export-rf-model.py <model_dir> [output_dir]')
        raise SystemExit(2)

    model_dir = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(__file__) + '/model'
    os.makedirs(output_dir, exist_ok=True)

    model = joblib.load(os.path.join(model_dir, 'rf_model.pkl'))
    encoders = joblib.load(os.path.join(model_dir, 'label_encoders.pkl'))
    feature_cols = joblib.load(os.path.join(model_dir, 'feature_cols.pkl'))

    trees = []
    for estimator in model.estimators_:
        t = estimator.tree_
        trees.append({
            'childrenLeft': t.children_left.tolist(),
            'childrenRight': t.children_right.tolist(),
            'feature': t.feature.tolist(),
            'threshold': t.threshold.tolist(),
            'value': [float(v[0][0]) for v in t.value]
        })

    payload = {
        'modelType': 'sklearn-random-forest-regressor',
        'nEstimators': len(trees),
        'featureCols': list(feature_cols),
        'encoders': {k: [str(x) for x in v.classes_.tolist()] for k, v in encoders.items()},
        'trees': trees
    }

    out = os.path.join(output_dir, 'rf-model.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(payload, f, separators=(',', ':'))

    print(f'Exported {len(trees)} trees to {out}')
    print('Copy rf-model.json into Backend/ai/model/ in FlatMate.')


if __name__ == '__main__':
    main()
