// app.js — Frequency frontend
//
// ---- Dark mode ----
const themeToggle = document.getElementById('themeToggle');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  themeToggle.setAttribute(
    'aria-label',
    theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  );
}

(function initTheme() {
  const saved = localStorage.getItem('talk4fun-theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
})();

themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('talk4fun-theme', next);
});

// IMPORTANT: set SERVER_URL to wherever server/server.js is deployed
// (e.g. Render/Railway/Fly.io). If you're serving this frontend from the
// SAME server, leave it as an empty string.
const SERVER_URL = ""; // e.g. "https://your-app.onrender.com"

const socket = SERVER_URL ? io(SERVER_URL) : io();

// ---- Screen helpers ----
const screens = {
  landing: document.getElementById('screen-landing'),
  profile: document.getElementById('screen-profile'),
  searching: document.getElementById('screen-searching'),
  chat: document.getElementById('screen-chat'),
};
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ---- Landing screen: age + terms consent ----
const ageCheck = document.getElementById('ageCheck');
const termsCheck = document.getElementById('termsCheck');
const landingFindMatchBtn = document.getElementById('landingFindMatchBtn');
const termsLink = document.getElementById('termsLink');
const termsModal = document.getElementById('termsModal');
const closeTermsBtn = document.getElementById('closeTermsBtn');

function updateLandingButton() {
  landingFindMatchBtn.disabled = !(ageCheck.checked && termsCheck.checked);
}
ageCheck.addEventListener('change', updateLandingButton);
termsCheck.addEventListener('change', updateLandingButton);

termsLink.addEventListener('click', () => termsModal.classList.remove('hidden'));
closeTermsBtn.addEventListener('click', () => termsModal.classList.add('hidden'));
termsModal.addEventListener('click', (e) => {
  if (e.target === termsModal) termsModal.classList.add('hidden');
});

landingFindMatchBtn.addEventListener('click', () => {
  showScreen('profile');
});

function showToast(text, ms = 3500) {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), ms);
}

// ---- Profile screen: name + interest ----
const profileForm = document.getElementById('profileForm');
const nicknameInput = document.getElementById('nicknameInput');
const interestsInput = document.getElementById('interestsInput');
const searchSub = document.getElementById('searchSub');

let myNickname = 'Stranger';
let myInterests = [];
let chatMode = 'text';

const modeTextBtn = document.getElementById('modeTextBtn');
const modeCallBtn = document.getElementById('modeCallBtn');
const modeHint = document.getElementById('modeHint');

function setChatMode(mode) {
  chatMode = mode;
  modeTextBtn.classList.toggle('active', mode === 'text');
  modeCallBtn.classList.toggle('active', mode === 'call');
  modeHint.textContent =
    mode === 'text'
      ? 'Text only — send messages back and forth.'
      : 'Voice call plus text chat, side by side.';
}
modeTextBtn.addEventListener('click', () => setChatMode('text'));
modeCallBtn.addEventListener('click', () => setChatMode('call'));

const nicknameError = document.getElementById('nicknameError');

nicknameInput.addEventListener('input', () => {
  if (nicknameInput.value.trim()) {
    nicknameInput.classList.remove('invalid');
    nicknameError.classList.add('hidden');
  }
});

profileForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const trimmedName = nicknameInput.value.trim();
  if (!trimmedName) {
    nicknameInput.classList.add('invalid');
    nicknameError.classList.remove('hidden');
    nicknameInput.focus();
    return;
  }
  nicknameInput.classList.remove('invalid');
  nicknameError.classList.add('hidden');

  myNickname = trimmedName;
  myInterests = interestsInput.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  searchSub.textContent = myInterests.length
    ? `Looking for someone into: ${myInterests.join(', ')}`
    : 'No interest set — matching with anyone available';

  showScreen('searching');

  socket.emit('find-match', {
    nickname: myNickname,
    interests: interestsInput.value,
    mode: chatMode,
  });
});

document.getElementById('cancelSearchBtn').addEventListener('click', () => {
  socket.emit('cancel-search');
  showScreen('profile');
});

document.getElementById('backToLandingBtn').addEventListener('click', () => {
  showScreen('landing');
});

// ---- Matched ----
const messagesEl = document.getElementById('messages');
const partnerNameLabel = document.getElementById('partnerNameLabel');
const sharedTagsEl = document.getElementById('sharedTags');
const typingIndicator = document.getElementById('typingIndicator');

let currentPartnerName = 'Stranger';

socket.on('searching', () => {
  showScreen('searching');
});

socket.on('matched', ({ partnerNickname, sharedInterests, initiator }) => {
  currentPartnerName = partnerNickname || 'Stranger';
  partnerNameLabel.textContent = currentPartnerName;
  messagesEl.innerHTML = '';
  sharedTagsEl.innerHTML = '';

  if (sharedInterests && sharedInterests.length) {
    sharedInterests.forEach((tag) => {
      const el = document.createElement('span');
      el.className = 'tag';
      el.textContent = tag;
      sharedTagsEl.appendChild(el);
    });
    addSystemMessage(`You both are into: ${sharedInterests.join(', ')}`);
  } else {
    addSystemMessage("You're connected with a stranger.");
  }

  isCallInitiatorRole = initiator;
  callBtn.classList.toggle('hidden', chatMode === 'text');
  showScreen('chat');
});

socket.on('partner-left', ({ reason }) => {
  addSystemMessage('Stranger has disconnected.');
  endCallLocally();
  showToast('Stranger disconnected. Click "New Stranger" to find someone else.');
});

document.getElementById('newChatBtn').addEventListener('click', () => {
  socket.emit('leave');
  endCallLocally();
  showScreen('profile');
});

// ---- Chat messaging ----
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');

function addMessage(text, who) {
  const div = document.createElement('div');
  div.className = `msg ${who}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function addSystemMessage(text) {
  addMessage(text, 'system');
}

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  addMessage(text, 'me');
  socket.emit('chat-message', { text });
  messageInput.value = '';
  socket.emit('typing', false);
});

let typingTimeout = null;
messageInput.addEventListener('input', () => {
  socket.emit('typing', true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit('typing', false), 1200);
});

socket.on('chat-message', ({ text }) => {
  addMessage(text, 'them');
});

socket.on('partner-typing', (isTyping) => {
  typingIndicator.classList.toggle('hidden', !isTyping);
});

// ============================================================
// WebRTC audio-only calling
// ============================================================
const callBtn = document.getElementById('callBtn');
const callBar = document.getElementById('callBar');
const callStatus = document.getElementById('callStatus');
const acceptCallBtn = document.getElementById('acceptCallBtn');
const hangupBtn = document.getElementById('hangupBtn');
const remoteAudio = document.getElementById('remoteAudio');

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

let pc = null;
let localStream = null;
let isCallInitiatorRole = true;
let callActive = false;

callBtn.addEventListener('click', () => {
  if (callActive) return;
  callStatus.textContent = `Calling ${currentPartnerName}…`;
  callBar.classList.remove('hidden');
  acceptCallBtn.classList.add('hidden');
  socket.emit('call-request');
});

socket.on('call-request', () => {
  if (chatMode === 'text') {
    socket.emit('call-decline');
    return;
  }
  callStatus.textContent = `${currentPartnerName} is calling…`;
  callBar.classList.remove('hidden');
  acceptCallBtn.classList.remove('hidden');
});

acceptCallBtn.addEventListener('click', async () => {
  acceptCallBtn.classList.add('hidden');
  socket.emit('call-accept');
  await beginCall(false);
});

socket.on('call-accept', async () => {
  callStatus.textContent = `Connecting…`;
  await beginCall(true);
});

socket.on('call-decline', () => {
  showToast('Stranger declined the call.');
  resetCallBar();
});

hangupBtn.addEventListener('click', () => {
  socket.emit('call-end');
  endCallLocally();
});

socket.on('call-end', () => {
  addSystemMessage('Call ended.');
  endCallLocally();
});

async function beginCall(isOfferer) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    showToast('Microphone access is required for calls.');
    resetCallBar();
    socket.emit('call-end');
    return;
  }

  pc = new RTCPeerConnection(ICE_SERVERS);
  callActive = true;
  callStatus.textContent = `On call with ${currentPartnerName}`;

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0];
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('webrtc-signal', { type: 'ice-candidate', candidate: event.candidate });
    }
  };

  pc.onconnectionstatechange = () => {
    if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
      endCallLocally();
    }
  };

  if (isOfferer) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('webrtc-signal', { type: 'offer', sdp: offer });
  }
}

socket.on('webrtc-signal', async (data) => {
  if (!data) return;
  try {
    if (data.type === 'offer') {
      if (!pc) await beginCall(false);
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-signal', { type: 'answer', sdp: answer });
    } else if (data.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else if (data.type === 'ice-candidate') {
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  } catch (err) {
    console.error('WebRTC signal error:', err);
  }
});

function endCallLocally() {
  callActive = false;
  if (pc) {
    pc.close();
    pc = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  remoteAudio.srcObject = null;
  resetCallBar();
}

function resetCallBar() {
  callBar.classList.add('hidden');
  acceptCallBtn.classList.add('hidden');
  callStatus.textContent = '';
}

window.addEventListener('beforeunload', () => {
  socket.emit('leave');
});
