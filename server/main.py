#!/usr/bin/env python3
"""
WebRTC Signaling Server for Chess Game
Handles peer connection signaling between players
"""

import secrets
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from datetime import datetime, timedelta

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(16))

# CORS - update with your GitHub Pages URL after deployment
ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', '*').split(',')
CORS(app, resources={r"/*": {"origins": ALLOWED_ORIGINS}})

socketio = SocketIO(
    app, 
    cors_allowed_origins=ALLOWED_ORIGINS,
    ping_timeout=60, 
    ping_interval=25,
    async_mode='eventlet'
)

active_users = {}
pending_challenges = {}

def cleanup_inactive_users():
    cutoff = datetime.now() - timedelta(minutes=5)
    inactive = [uid for uid, data in active_users.items() 
                if data['last_seen'] < cutoff]
    for uid in inactive:
        del active_users[uid]

@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')
    emit('connected', {'sid': request.sid})

@socketio.on('disconnect')
def handle_disconnect():
    print(f'Client disconnected: {request.sid}')
    user_id = None
    for uid, data in list(active_users.items()):
        if data['sid'] == request.sid:
            user_id = uid
            del active_users[uid]
            break
    
    if user_id:
        emit('opponent_disconnected', {'user_id': user_id}, broadcast=True)

@socketio.on('register')
def handle_register(data):
    user_id = data.get('user_id')
    
    if not user_id:
        emit('error', {'message': 'user_id required'})
        return
    
    active_users[user_id] = {
        'sid': request.sid,
        'last_seen': datetime.now()
    }
    
    join_room(user_id)
    
    print(f'User registered: {user_id} -> {request.sid}')
    emit('registered', {'user_id': user_id, 'status': 'success'})

@socketio.on('challenge')
def handle_challenge(data):
    from_user = data.get('from')
    to_user = data.get('to')
    offer = data.get('offer')
    
    if not all([from_user, to_user, offer]):
        emit('error', {'message': 'Invalid challenge data'})
        return
    
    if to_user not in active_users:
        emit('challenge_failed', {
            'message': f'User {to_user} is not online',
            'to': to_user
        })
        return
    
    if from_user in active_users:
        active_users[from_user]['last_seen'] = datetime.now()
    
    target_sid = active_users[to_user]['sid']
    
    print(f'Challenge: {from_user} -> {to_user}')
    
    socketio.emit('challenge_received', {
        'from': from_user,
        'offer': offer
    }, room=target_sid)
    
    emit('challenge_sent', {'to': to_user, 'status': 'delivered'})

@socketio.on('answer')
def handle_answer(data):
    from_user = data.get('from')
    to_user = data.get('to')
    answer = data.get('answer')
    
    if not all([from_user, to_user, answer]):
        emit('error', {'message': 'Invalid answer data'})
        return
    
    if to_user not in active_users:
        emit('answer_failed', {
            'message': f'User {to_user} is not online',
            'to': to_user
        })
        return
    
    if from_user in active_users:
        active_users[from_user]['last_seen'] = datetime.now()
    
    target_sid = active_users[to_user]['sid']
    
    print(f'Answer: {from_user} -> {to_user}')
    
    socketio.emit('answer_received', {
        'from': from_user,
        'answer': answer
    }, room=target_sid)
    
    emit('answer_sent', {'to': to_user, 'status': 'delivered'})

@socketio.on('ice_candidate')
def handle_ice_candidate(data):
    from_user = data.get('from')
    to_user = data.get('to')
    candidate = data.get('candidate')
    
    if not all([from_user, to_user, candidate]):
        return
    
    if to_user in active_users:
        target_sid = active_users[to_user]['sid']
        socketio.emit('ice_candidate', {
            'from': from_user,
            'candidate': candidate
        }, room=target_sid)

@socketio.on('ping')
def handle_ping(data):
    user_id = data.get('user_id')
    if user_id and user_id in active_users:
        active_users[user_id]['last_seen'] = datetime.now()
        emit('pong', {'timestamp': datetime.now().isoformat()})

@socketio.on('check_user')
def handle_check_user(data):
    user_id = data.get('user_id')
    is_online = user_id in active_users
    
    emit('user_status', {
        'user_id': user_id,
        'online': is_online
    })

@app.route('/health', methods=['GET'])
def health():
    cleanup_inactive_users()
    return jsonify({
        'status': 'healthy',
        'active_users': len(active_users),
        'timestamp': datetime.now().isoformat()
    })

@app.route('/users/online', methods=['GET'])
def get_online_users():
    cleanup_inactive_users()
    return jsonify({
        'count': len(active_users),
        'users': list(active_users.keys())
    })

@app.route('/user/<user_id>/status', methods=['GET'])
def get_user_status(user_id):
    is_online = user_id in active_users
    return jsonify({
        'user_id': user_id,
        'online': is_online
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    is_production = os.environ.get('RENDER', False)
    
    print("-" * 69)
    print("WebRTC Signaling Server for Chess")
    print("-" * 69)
    print(f"Environment: {'Production (Render)' if is_production else 'Development'}")
    print(f"Server starting on port {port}")
    print("-" * 69)
    
    if is_production:
        import eventlet
        eventlet.wsgi.server(eventlet.listen(('0.0.0.0', port)), app)
    else:
        socketio.run(app, host='0.0.0.0', port=port, debug=True)