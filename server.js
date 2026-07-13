// server.js — Frequency backend
// Handles: interest-based matching, text chat relay, WebRTC signaling for audio-only calls.
// Run with: node server.js  (see package.json for deps)

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Allow the frontend to live on a different domain (e.g. Vercel/InfinityFree)
// while this server runs elsewhere (e.g. Render/Railway/Fly.io).
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

// Optional: serve the frontend from this same server too, if you want a
// single deployment instead of splitting frontend/backend.
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;

// ---- In-memory state ----
// waitingPool: sockets currently looking for a match
//   { socketId, nickname, interests: string[] }
let waitingPool = [];

// activePairs: socketId -> partnerSocketId
const activePairs = new Map();

function normalizeInterests(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10); // cap so nobody spams huge tag lists
}

function findMatchFor(candidate) {
  // 1. Prefer someone who shares at least one interest tag.
  if (candidate.interests.length > 0) {
    const idx = waitingPool.findIndex(
      (u) =>
        u.socketId !== candidate.socketId &&
        u.interests.some((tag) => candidate.interests.includes(tag))
    );
    if (idx !== -1) return idx;
  }

  // 2. No shared-interest match (or candidate entered no interests at all):
  //    fall back to the longest-waiting stranger, interests or not.
  const idx = waitingPool.findIndex((u) => u.socketId !== candidate.socketId);
  return idx;
}

function removeFromWaitingPool(socketId) {
  waitingPool = waitingPool.filter((u) => u.socketId !== socketId);
}

function endPairing(socketId, reason) {
  const partnerId = activePairs.get(socketId);
  if (partnerId) {
    activePairs.delete(socketId);
    activePairs.delete(partnerId);
    io.to(partnerId).emit('partner-left', { reason });
  }
  removeFromWaitingPool(socketId);
}

function broadcastOnlineCount() {
  io.emit('online-count', io.engine.clientsCount);
}

io.on('connection', (socket) => {
  socket.data.nickname = 'Stranger';
  socket.data.interests = [];

  broadcastOnlineCount();

  socket.on('find-match', ({ nickname, interests }) => {
    // Reset if this socket was already paired or waiting
    endPairing(socket.id, 'requeued');

    const cleanNickname = (nickname || '').trim().slice(0, 24) || 'Stranger';
    const cleanInterests = normalizeInterests(interests);

    socket.data.nickname = cleanNickname;
    socket.data.interests = cleanInterests;

    const candidate = {
      socketId: socket.id,
      nickname: cleanNickname,
      interests: cleanInterests,
    };

    const matchIdx = findMatchFor(candidate);

    if (matchIdx === -1) {
      waitingPool.push(candidate);
      socket.emit('searching');
      return;
    }

    const partner = waitingPool[matchIdx];
    waitingPool.splice(matchIdx, 1);

    activePairs.set(socket.id, partner.socketId);
    activePairs.set(partner.socketId, socket.id);

    const sharedInterests = candidate.interests.filter((t) =>
      partner.interests.includes(t)
    );

    socket.emit('matched', {
      partnerNickname: partner.nickname,
      sharedInterests,
      initiator: true, // this client starts WebRTC offers if a call begins
    });
    io.to(partner.socketId).emit('matched', {
      partnerNickname: candidate.nickname,
      sharedInterests,
      initiator: false,
    });
  });

  socket.on('cancel-search', () => {
    removeFromWaitingPool(socket.id);
  });

  socket.on('chat-message', ({ text }) => {
    const partnerId = activePairs.get(socket.id);
    if (!partnerId || !text) return;
    const clean = String(text).slice(0, 2000);
    io.to(partnerId).emit('chat-message', {
      text: clean,
      from: socket.data.nickname,
    });
  });

  socket.on('typing', (isTyping) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) io.to(partnerId).emit('partner-typing', !!isTyping);
  });

  // ---- WebRTC signaling relay (audio-only calls) ----
  socket.on('call-request', () => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) io.to(partnerId).emit('call-request');
  });

  socket.on('call-accept', () => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) io.to(partnerId).emit('call-accept');
  });

  socket.on('call-decline', () => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) io.to(partnerId).emit('call-decline');
  });

  socket.on('call-end', () => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) io.to(partnerId).emit('call-end');
  });

  socket.on('webrtc-signal', (data) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) io.to(partnerId).emit('webrtc-signal', data);
  });

  socket.on('leave', () => {
    endPairing(socket.id, 'left');
  });

  socket.on('disconnect', () => {
    endPairing(socket.id, 'disconnected');
    broadcastOnlineCount();
  });
});

server.listen(PORT, () => {
  console.log(`Frequency signaling server running on port ${PORT}`);
});
