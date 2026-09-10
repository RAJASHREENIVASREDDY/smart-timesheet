from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import re

app = Flask(__name__)
CORS(app)

# Simple ML classification (expandable)
def classify_activity(app_name):
    app_name = app_name.lower()
    
    # Keywords mapping
    keywords = {
        'design': ['autocad', 'figma', 'sketchup', 'revit', 'blender', 'photoshop', 'illustrator'],
        'development': ['vscode', 'github', 'vs code', 'terminal', 'git', 'cursor'],
        'communication': ['gmail', 'outlook', 'slack', 'whatsapp', 'teams', 'zoom', 'meet'],
        'documentation': ['word', 'excel', 'powerpoint', 'docs', 'sheets', 'slides', 'notion'],
        'research': ['chrome', 'firefox', 'safari', 'browser', 'research', 'stackoverflow']
    }
    
    for category, apps in keywords.items():
        if any(app in app_name for app in apps):
            return category
    
    return 'other'

# API endpoint
@app.route('/classify', methods=['POST'])
def classify():
    data = request.json
    app_name = data.get('appName', '')
    category = classify_activity(app_name)
    return jsonify({'category': category})

if __name__ == '__main__':
    app.run(port=5000)