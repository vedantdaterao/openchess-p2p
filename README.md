# Chess WebRTC

A simple peer-to-peer chess game where two players can play together using WebRTC for direct browser-to-browser connection.

## Features

- Peer-to-peer gameplay with WebRTC
- Real-time move synchronization
- No server required for gameplay

## Getting Started

1. Start the signaling server:
   ```bash
   python3 server/signaling_server.py
   ```

2. Open [link](https://vedantdaterao.github.io/openchess-p2p/) in your browser
3. One player shares the `User Id`
4. Other player enters the shared `User Id` and click challenge
5. Start playing!
