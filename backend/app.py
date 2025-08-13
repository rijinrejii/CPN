from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
import base64
import requests
from PIL import Image
from datetime import datetime
import hashlib
app = Flask(__name__)
CORS(app)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
GOOGLE_API_KEY = os.getenv('GOOGLE_CLOUD_API_KEY')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
def analyze_image_content(image_path):
    try:
        with open(image_path, 'rb') as image_file:
            image_content = base64.b64encode(image_file.read()).decode('utf-8')
        url = f'https://vision.googleapis.com/v1/images:annotate?key={GOOGLE_API_KEY}'
        payload = {
            'requests': [{
                'image': {'content': image_content},
                'features': [
                    {'type': 'SAFE_SEARCH_DETECTION', 'maxResults': 1},
                    {'type': 'LABEL_DETECTION', 'maxResults': 10},
                    {'type': 'TEXT_DETECTION', 'maxResults': 1}
                ]
            }]
        }
        response = requests.post(url, json=payload)
        return response.json()
    except Exception as e:
        return {'error': str(e)}
def calculate_risk_score(vision_result):
    if 'error' in vision_result:
        return 0, 'Error in analysis'
    risk_score = 0
    risk_factors = []
    try:
        safe_search = vision_result['responses'][0].get('safeSearchAnnotation', {})
        risk_mappings = {
            'adult': {'VERY_LIKELY': 90, 'LIKELY': 70, 'POSSIBLE': 40},
            'violence': {'VERY_LIKELY': 85, 'LIKELY': 65, 'POSSIBLE': 35},
            'racy': {'VERY_LIKELY': 80, 'LIKELY': 60, 'POSSIBLE': 30}
        }
        for category, scores in risk_mappings.items():
            level = safe_search.get(category, 'VERY_UNLIKELY')
            if level in scores:
                risk_score += scores[level]
                risk_factors.append(f'{category.title()}: {level}')
        labels = vision_result['responses'][0].get('labelAnnotations', [])
        concerning_labels = ['weapon', 'drug', 'alcohol', 'violence', 'adult', 'inappropriate']
        for label in labels:
            if any(concern in label['description'].lower() for concern in concerning_labels):
                risk_score += min(label['score'] * 50, 30)
                risk_factors.append(f'Content: {label["description"]}')
        risk_score = min(risk_score, 100)
        return risk_score, risk_factors
    except Exception as e:
        return 0, [f'Analysis error: {str(e)}']
@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    if not file.filename or file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    if file and allowed_file(file.filename):
        original_filename = file.filename
        filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{hashlib.md5(original_filename.encode()).hexdigest()[:8]}.{original_filename.rsplit('.', 1)[1].lower()}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        vision_result = analyze_image_content(filepath)
        risk_score, risk_factors = calculate_risk_score(vision_result)
        result = {
            'filename': filename,
            'risk_score': risk_score,
            'risk_factors': risk_factors,
            'timestamp': datetime.now().isoformat(),
            'status': 'safe' if risk_score < 30 else 'concerning' if risk_score < 70 else 'high_risk'
        }
        return jsonify(result)
    return jsonify({'error': 'Invalid file type'}), 400
@app.route('/api/bulk-scan', methods=['POST'])
def bulk_scan():
    files = request.files.getlist('files')
    if not files:
        return jsonify({'error': 'No files provided'}), 400
    results = []
    for file in files:
        if file and file.filename and allowed_file(file.filename):
            original_filename = file.filename
            filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{hashlib.md5(original_filename.encode()).hexdigest()[:8]}.{original_filename.rsplit('.', 1)[1].lower()}"
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            vision_result = analyze_image_content(filepath)
            risk_score, risk_factors = calculate_risk_score(vision_result)
            results.append({
                'original_filename': original_filename,
                'filename': filename,
                'risk_score': risk_score,
                'risk_factors': risk_factors,
                'status': 'safe' if risk_score < 30 else 'concerning' if risk_score < 70 else 'high_risk'
            })
    return jsonify({'results': results, 'summary': {'total': len(results), 'high_risk': len([r for r in results if r['status'] == 'high_risk']), 'concerning': len([r for r in results if r['status'] == 'concerning'])}})
@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')
@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('../frontend', filename)
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()})
if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs('reports', exist_ok=True)
    app.run(debug=True, host='0.0.0.0', port=5001)