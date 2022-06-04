import AGORA_APP_ID from './apikey.js';

// agora variable
let APP_ID = AGORA_APP_ID;
let token = null;
let uid = Math.floor(Math.random() * 10000).toString();
let client;
let channel;

// get Room Id from url
let queryString = window.location.search;
let urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get('room');

if (!roomId) {
	window.location = `lobby.html`;
}

// my user audio, video.
let localStream;
// other user audio, video.
let remoteStream;
// peer connection
let peerConnection;

// stunt server
const servers = {
	iceServers: [
		{
			urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
		},
	],
};

// when user join, start peer connection
let handleUserJoined = async MemberId => {
	// A new user join the channel: 2903
	console.log('A new user join the channel:', MemberId);
	createOffer(MemberId);
};

// when user leave
let handleUserLeft = MemberId => {
	// user left no only close the browser, but also close laptop or close by right top close button
	document.getElementById('user-2').style.display = 'none';
	document.getElementById('user-1').classList.remove('smallFrame');
};

// transfer the data(ICE candidate, offer, answer) between each peer
let handleMessageFromPeer = async (message, MemberId) => {
	message = JSON.parse(message.text);

	if (message.type === 'offer') {
		createAnswer(MemberId, message.offer);
	}

	if (message.type === 'answer') {
		addAnswer(message.answer);
	}

	if (message.type === 'candidate') {
		if (peerConnection) {
			peerConnection.addIceCandidate(message.candidate);
		}
	}
};

// video and audio config
let constraints = {
	video: {
		width: { min: 640, ideal: 1920, max: 1920 },
		height: { min: 480, ideal: 1080, max: 1080 },
	},
	audio: true,
};

let init = async () => {
	////////////// client ///////////
	// using agora to create a client
	client = await AgoraRTM.createInstance(APP_ID);
	// login agora client
	await client.login({ uid, token });

	////////////// channel ///////////
	// use this client to create a channel
	channel = client.createChannel(roomId);
	// join this channel
	await channel.join();

	//////////////// activate from channel /////////////////
	// listen to member join
	channel.on('MemberJoined', handleUserJoined);

	// listen to member left
	channel.on('MemberLeft', handleUserLeft);

	// listen to each peer message
	client.on('MessageFromPeer', handleMessageFromPeer);

	//////////////// local stream ///////////////
	// create a local media stream
	localStream = await navigator.mediaDevices.getUserMedia(constraints);
	document.getElementById('user-1').srcObject = localStream;
};

// create a peer connection to connect two member
let createPeerConnection = async MemberId => {
	peerConnection = new RTCPeerConnection(servers);

	// create a remote media stream
	remoteStream = new MediaStream();
	document.getElementById('user-2').srcObject = remoteStream;
	document.getElementById('user-2').style.display = 'block';
	// when remote user is join, local user will be small screen
	document.getElementById('user-1').classList.add('smallFrame');

	// if local stream is not find
	if (!localStream) {
		// create a local media stream
		localStream = await navigator.mediaDevices.getUserMedia(constraints);
		document.getElementById('user-1').srcObject = localStream;
	}

	// add local stream track(video, audio)
	localStream.getTracks().forEach(track => {
		peerConnection.addTrack(track, localStream);
	});

	// add remote stream track(video, audio)
	peerConnection.ontrack = event => {
		event.streams[0].getTracks().forEach(track => {
			remoteStream.addTrack(track);
		});
	};

	// use sendMessageToPeer function to transfer ICE candidate(ip address)
	peerConnection.onicecandidate = async event => {
		if (event.candidate) {
			client.sendMessageToPeer(
				{
					text: JSON.stringify({
						type: 'candidate',
						candidate: event.candidate,
					}),
				},
				MemberId
			);
		}
	};
};

// 1. create offer to remote user
let createOffer = async MemberId => {
	// create connection
	await createPeerConnection(MemberId);

	// create offer
	let offer = await peerConnection.createOffer();
	// set offer to local description of local user
	await peerConnection.setLocalDescription(offer);

	// send this offer to remote user
	client.sendMessageToPeer(
		{ text: JSON.stringify({ type: 'offer', offer: offer }) },
		MemberId
	);
};

// 2. create a answer to local user
let createAnswer = async (MemberId, offer) => {
	await createPeerConnection(MemberId);

	// set offer to remote description of remote user
	await peerConnection.setRemoteDescription(offer);

	let answer = await peerConnection.createAnswer();
	// set answer to local description of remote user
	await peerConnection.setLocalDescription(answer);

	// send this answer to local user
	client.sendMessageToPeer(
		{ text: JSON.stringify({ type: 'answer', answer: answer }) },
		MemberId
	);
};

// 3. local user add the answer
let addAnswer = async answer => {
	// if peer connection current remote description is not defined
	if (!peerConnection.currentRemoteDescription) {
		// set answer to remote description of local user
		peerConnection.setRemoteDescription(answer);
	}
};

// when user leave, the channel kick out the user and user logout
let leaveChannel = async () => {
	await channel.leave();
	await client.logout();
};

///////////////////// toggle camera and mic /////////////////
let toggleCamera = async () => {
	let videoTrack = localStream
		.getTracks()
		.find(track => track.kind === 'video');

	if (videoTrack.enabled) {
		videoTrack.enabled = false;
		document.getElementById('camera-btn').style.backgroundColor =
			'rgba(255, 80, 80)';
	} else {
		videoTrack.enabled = true;
		document.getElementById('camera-btn').style.backgroundColor =
			'rgba(179, 102, 249, 0.9)';
	}
};

let toggleMic = async () => {
	let audioTrack = localStream
		.getTracks()
		.find(track => track.kind === 'audio');

	if (audioTrack.enabled) {
		audioTrack.enabled = false;
		document.getElementById('mic-btn').style.backgroundColor =
			'rgba(255, 80, 80)';
	} else {
		audioTrack.enabled = true;
		document.getElementById('mic-btn').style.backgroundColor =
			'rgba(179, 102, 249, 0.9)';
	}
};

// before close the browser, call leaveChannel function
window.addEventListener('beforeunload', leaveChannel);
document.getElementById('camera-btn').addEventListener('click', toggleCamera);
document.getElementById('mic-btn').addEventListener('click', toggleMic);

init();
