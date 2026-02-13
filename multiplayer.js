const SIGNALING_SERVER = "https://openchess-p2p.onrender.com";

class MessageBox {
    constructor() {
        this.container = document.querySelector(".message-box");
        if (!this.container) {
            console.error("Message box container not found");
        }
    }

    show(message, type = "info", duration = 5000) {
        if (!this.container) return;

        const msgEl = document.createElement("div");
        msgEl.className = `message message-${type}`;
        msgEl.textContent = message;

        this.container.appendChild(msgEl);

        if (duration > 0) {
            setTimeout(() => msgEl.remove(), duration);
        }

        return msgEl;
    }

    confirm(message, onConfirm, onReject) {
        if (!this.container) return;

        const msgEl = document.createElement("div");
        msgEl.className = "message message-confirm";
        msgEl.innerHTML = `
            <p>${message}</p>
            <div class="message-buttons">
                <button class="btn-accept">Accept</button>
                <button class="btn-decline">Decline</button>
            </div>
        `;

        this.container.appendChild(msgEl);

        msgEl.querySelector(".btn-accept").addEventListener("click", () => {
            msgEl.remove();
            onConfirm();
        });

        msgEl.querySelector(".btn-decline").addEventListener("click", () => {
            msgEl.remove();
            if (onReject) onReject();
        });
    }

    clear() {
        if (this.container) {
            this.container.innerHTML = "";
        }
    }
}

class ChessMultiplayer {
    constructor() {
        this.pc = null;
        this.dataChannel = null;
        this.socket = null;
        this.myUserId = this.generateUserId();
        this.opponentId = null;
        this.isHost = false;
        this.myColor = null;
        this.onMoveReceived = null;
        this.onConnectionStateChange = null;
        this.connected = false;
        this.challengeInProgress = false;
        this.pendingChallengeFrom = null;

        this.whiteTime = 600000;
        this.blackTime = 600000;
        this.clockInterval = null;
        this.lastMoveTime = null;
        this.clockRunning = false;

        this.messageBox = new MessageBox();

        this.config = {
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
        };
    }

    generateUserId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    connectToServer() {
        return new Promise((resolve, reject) => {
            this.socket = io(SIGNALING_SERVER, {
                transports: ["websocket", "polling"],
            });

            this.socket.on("connect", () => {
                console.log("Connected to signaling server");

                this.socket.emit("register", { user_id: this.myUserId });

                this.socket.on("registered", (data) => {
                    console.log("Registered as:", data.user_id);
                    this.setupSignalingListeners();
                    resolve();
                });
            });

            this.socket.on("connect_error", (error) => {
                console.error("Connection error:", error);
                reject(error);
            });

            this.socket.on("disconnect", () => {
                console.log("Disconnected from signaling server");
                if (this.onConnectionStateChange) {
                    this.onConnectionStateChange("disconnected");
                }
            });

            setInterval(() => {
                if (this.socket && this.socket.connected) {
                    this.socket.emit("ping", { user_id: this.myUserId });
                }
            }, 30000);
        });
    }

    setupSignalingListeners() {
        this.socket.on("challenge_received", async (data) => {
            console.log("Challenge received from:", data.from);

            if (this.challengeInProgress || this.connected) {
                this.socket.emit("challenge_failed", {
                    to: data.from,
                    message: "User is already in a game",
                });
                return;
            }

            if (this.pendingChallengeFrom) {
                this.messageBox.show(`Already have pending challenge from ${this.pendingChallengeFrom}`, "warning");
                return;
            }

            this.pendingChallengeFrom = data.from;

            this.messageBox.confirm(
                `${data.from} wants to play chess with you. You will be BLACK.`,
                async () => {
                    this.challengeInProgress = true;
                    this.opponentId = data.from;
                    this.pendingChallengeFrom = null;
                    await this.acceptChallenge(data.offer);
                },
                () => {
                    console.log("Challenge declined");
                    this.pendingChallengeFrom = null;
                },
            );
        });

        this.socket.on("answer_received", async (data) => {
            console.log("Answer received from:", data.from);
            this.opponentId = data.from;
            await this.handleAnswer(data.answer);
        });

        this.socket.on("ice_candidate", async (data) => {
            if (this.pc && data.candidate) {
                try {
                    await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                    console.log("ICE candidate added");
                } catch (err) {
                    console.error("Error adding ICE candidate:", err);
                }
            }
        });

        this.socket.on("challenge_sent", (data) => {
            console.log("Challenge sent to:", data.to);
            this.updateStatus("Challenge sent! Waiting for response...");
        });

        this.socket.on("challenge_failed", (data) => {
            console.error("Challenge failed:", data.message);
            this.messageBox.show(data.message, "error");
            this.challengeInProgress = false;
            this.updateStatus("Ready to play");
        });

        this.socket.on("opponent_disconnected", (data) => {
            if (data.user_id === this.opponentId) {
                console.log("Opponent disconnected");
                this.messageBox.show("Your opponent has disconnected", "warning");
                this.cleanup();
            }
        });
    }

    async sendChallenge(opponentId) {
        if (this.challengeInProgress || this.connected) {
            this.messageBox.show("Already in a game or challenge", "warning");
            return;
        }

        this.challengeInProgress = true;
        this.opponentId = opponentId;
        this.isHost = true;
        this.myColor = "w";

        this.pc = new RTCPeerConnection(this.config);
        this.setupPeerConnection();

        this.dataChannel = this.pc.createDataChannel("chess-moves");
        this.setupDataChannel();

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);

        this.socket.emit("challenge", {
            from: this.myUserId,
            to: opponentId,
            offer: {
                type: offer.type,
                sdp: offer.sdp,
            },
        });

        console.log("Challenge sent to:", opponentId);
        this.updateStatus("Challenge sent! Waiting for response...");
    }

    async acceptChallenge(offer) {
        this.isHost = false;
        this.myColor = "b";

        this.pc = new RTCPeerConnection(this.config);
        this.setupPeerConnection();

        this.pc.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.setupDataChannel();
        };

        await this.pc.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        this.socket.emit("answer", {
            from: this.myUserId,
            to: this.opponentId,
            answer: {
                type: answer.type,
                sdp: answer.sdp,
            },
        });

        console.log("Answer sent");
        this.updateStatus("Connecting...");
    }

    async handleAnswer(answer) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log("Connection established");
    }

    setupPeerConnection() {
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit("ice_candidate", {
                    from: this.myUserId,
                    to: this.opponentId,
                    candidate: event.candidate,
                });
            }
        };

        this.pc.onconnectionstatechange = () => {
            console.log("Connection state:", this.pc.connectionState);

            if (this.pc.connectionState === "connected") {
                this.connected = true;
                this.challengeInProgress = false;
                this.updateStatus(`Connected! You are ${this.myColor === "w" ? "WHITE" : "BLACK"}`);
            } else if (this.pc.connectionState === "failed" || this.pc.connectionState === "disconnected") {
                this.connected = false;
                this.challengeInProgress = false;
                this.updateStatus("Connection lost");
            }

            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(this.pc.connectionState);
            }
        };

        this.pc.oniceconnectionstatechange = () => {
            console.log("ICE connection state:", this.pc.iceConnectionState);
        };
    }

    setupDataChannel() {
        this.dataChannel.onopen = () => {
            console.log("Data channel opened");
            this.connected = true;
            const colorText = this.myColor === "w" ? "WHITE" : "BLACK";
            this.updateStatus(`Game started! You are ${colorText}`);

            this.startClock();

            if (this.onConnectionStateChange) {
                this.onConnectionStateChange("connected");
            }
        };

        this.dataChannel.onclose = () => {
            console.log("Data channel closed");
            this.connected = false;
            this.stopClock();
        };

        this.dataChannel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === "move") {
                    console.log("Move received:", data);

                    this.whiteTime = data.whiteTime;
                    this.blackTime = data.blackTime;

                    this.updateClockDisplay();

                    if (this.onMoveReceived) {
                        this.onMoveReceived(data);
                    }
                } else if (data.type === "time_sync") {
                    this.whiteTime = data.whiteTime;
                    this.blackTime = data.blackTime;
                    this.updateClockDisplay();
                }
            } catch (err) {
                console.error("Error parsing move:", err);
            }
        };

        this.dataChannel.onerror = (error) => {
            console.error("Data channel error:", error);
        };
    }

    sendMove(from, to, piece, captured) {
        if (!this.dataChannel || this.dataChannel.readyState !== "open") {
            console.error("Cannot send move - not connected");
            return false;
        }

        const moveData = {
            type: "move",
            from,
            to,
            piece,
            captured,
            timestamp: Date.now(),
            senderColor: this.myColor,
            whiteTime: this.whiteTime,
            blackTime: this.blackTime,
        };

        this.dataChannel.send(JSON.stringify(moveData));
        console.log("Move sent:", moveData);
        return true;
    }

    isConnected() {
        return this.connected && this.dataChannel && this.dataChannel.readyState === "open";
    }

    updateStatus(message) {
        const statusEl = document.getElementById("connection_status");
        if (statusEl) {
            statusEl.textContent = message;
        }
        console.log("Status:", message);
    }

    cleanup() {
        if (this.dataChannel) {
            this.dataChannel.close();
        }
        if (this.pc) {
            this.pc.close();
        }
        this.stopClock();
        this.connected = false;
        this.challengeInProgress = false;
        this.opponentId = null;
        this.pendingChallengeFrom = null;
        this.updateStatus("Ready to play");
    }

    disconnect() {
        this.cleanup();
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    startClock() {
        if (this.clockRunning) return;

        this.clockRunning = true;
        this.lastMoveTime = Date.now();

        this.clockInterval = setInterval(() => {
            const elapsed = Date.now() - this.lastMoveTime;
            this.lastMoveTime = Date.now();

            if (typeof TURN !== "undefined") {
                if (TURN === "w") {
                    this.whiteTime = Math.max(0, this.whiteTime - elapsed);
                    if (this.whiteTime === 0) {
                        this.stopClock();
                        this.handleTimeOut("w");
                    }
                } else {
                    this.blackTime = Math.max(0, this.blackTime - elapsed);
                    if (this.blackTime === 0) {
                        this.stopClock();
                        this.handleTimeOut("b");
                    }
                }
            }

            this.updateClockDisplay();
        }, 100);
    }

    stopClock() {
        if (this.clockInterval) {
            clearInterval(this.clockInterval);
            this.clockInterval = null;
        }
        this.clockRunning = false;
    }

    updateClockDisplay() {
        const whiteEl = document.getElementById("white_time");
        const blackEl = document.getElementById("black_time");

        if (whiteEl) {
            whiteEl.textContent = this.formatTime(this.whiteTime);
            whiteEl.classList.toggle("active", typeof TURN !== "undefined" && TURN === "w" && this.clockRunning);
        }

        if (blackEl) {
            blackEl.textContent = this.formatTime(this.blackTime);
            blackEl.classList.toggle("active", typeof TURN !== "undefined" && TURN === "b" && this.clockRunning);
        }
    }

    formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }

    handleTimeOut(color) {
        const colorName = color === "w" ? "White" : "Black";
        this.messageBox.show(`${colorName} ran out of time! ${color === "w" ? "Black" : "White"} wins!`, "warning", 0);
        this.cleanup();
    }

    setTimeControl(minutes) {
        this.whiteTime = minutes * 60 * 1000;
        this.blackTime = minutes * 60 * 1000;
        this.updateClockDisplay();
    }

    syncTime() {
        if (this.dataChannel && this.dataChannel.readyState === "open") {
            this.dataChannel.send(
                JSON.stringify({
                    type: "time_sync",
                    whiteTime: this.whiteTime,
                    blackTime: this.blackTime,
                }),
            );
        }
    }
}

let multiplayer = null;

window.addEventListener("DOMContentLoaded", async () => {
    multiplayer = new ChessMultiplayer();

    const userIdEl = document.getElementById("user_id");
    if (userIdEl) {
        userIdEl.textContent = multiplayer.myUserId;
    }

    try {
        await multiplayer.connectToServer();
        multiplayer.updateStatus("Ready to play");

        multiplayer.onMoveReceived = (moveData) => {
            applyOpponentMove(moveData);
        };
    } catch (error) {
        console.error("Failed to connect to server:", error);
        multiplayer.updateStatus("Server connection failed");
        multiplayer.messageBox.show("Cannot connect to game server. Please check if the server is running.", "error", 0);
    }

    const challengeForm = document.getElementById("challengeForm");
    if (challengeForm) {
        challengeForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const opponentIdInput = document.getElementById("peer_user_id");
            const opponentId = opponentIdInput.value.trim().toUpperCase();

            if (!opponentId) {
                multiplayer.messageBox.show("Please enter opponent ID", "warning");
                return;
            }

            if (opponentId === multiplayer.myUserId) {
                multiplayer.messageBox.show("You cannot challenge yourself!", "warning");
                return;
            }

            if (multiplayer.challengeInProgress || multiplayer.connected) {
                multiplayer.messageBox.show("Already in a game or challenge", "warning");
                return;
            }

            multiplayer.socket.emit("check_user", { user_id: opponentId });
            multiplayer.socket.once("user_status", async (data) => {
                if (!data.online) {
                    multiplayer.messageBox.show(`User ${opponentId} is not online`, "warning");
                    return;
                }

                await multiplayer.sendChallenge(opponentId);
                opponentIdInput.value = "";
            });
        });
    }

    const copyBtn = document.getElementById("copy_id_btn");
    if (copyBtn) {
        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(multiplayer.myUserId).then(() => {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = "Copied!";
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
            });
        });
    }
});

function applyOpponentMove(moveData) {
    console.log("Applying opponent move:", moveData);

    if (typeof move === "function") {
        const temp = multiplayer;
        multiplayer = null;

        try {
            move(moveData.from, moveData.to);
        } catch (err) {
            console.error("Error applying move:", err);
        }

        multiplayer = temp;
    } else {
        console.error("move() function not found");
    }
}

window.addEventListener("beforeunload", () => {
    if (multiplayer) {
        multiplayer.disconnect();
    }
});
