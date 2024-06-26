const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const {
  JOIN_ROOM,
  SEND_MESSAGE,
  RECEIVE_MESSAGE,
  POPULATE_CHAT,
  MESSAGE_SUCCESS,
  MESSAGE_FAILED,
  JOIN_GROUP_ROOM,
  POPULATE_GROUP_CHAT,
  SEND_GROUP_MESSAGE,
  GROUP_MESSAGE_SUCCESS,
  GROUP_MESSAGE_FAILED,
  SEND_VOTE,
  VOTE_SUCCESS,
  VOTE_FAILED,
  CREATE_POLL,
  CREATE_POLL_SUCCESS,
  CREATE_POLL_FAILED,
  JOIN_LIST,
  MAKE_OFFLINE,
} = require('./lib/events');
const connectDB = require('./lib/db');
const handlers = require('./lib/handlers');

const app = express();
const socketServer = http.createServer(app);
const io = new Server(socketServer, { cors: { origin: '*' } });
const PORT = 3500;

app.use(cors());

io.on('connection', (socket) => {
  socket.on('chat message', (message) => {
    console.log('Event chat message emitted, received message: ' + message);
    // sending event back to client
    socket.emit('reply message', 'Server received: ' + message);
  });

  socket.on(JOIN_ROOM, async (data) => {
    const chatRoomId = data.chatRoomId;
    const currentUserId = data.currentUserId;
    const targetUserId = data.targetUserId;

    // join room to limit client that can receive the event
    socket.join(chatRoomId);

    // query chat room from db
    const chatRoomdata = await handlers.openChatRoom(
      currentUserId,
      targetUserId
    );

    // change user online status
    await handlers.makeOnline;

    io.to(chatRoomId).emit(POPULATE_CHAT, chatRoomdata);
  });

  // Send message to a chat room
  socket.on(SEND_MESSAGE, async (data) => {
    const { chatRoomId, creatorUsername, text, senderUserId } = data;

    const insertResult = await handlers.insertMessage(
      chatRoomId,
      creatorUsername,
      text,
      senderUserId
    );

    if (insertResult.success) {
      io.to(chatRoomId).emit(POPULATE_CHAT);
      io.to(chatRoomId).emit(MESSAGE_SUCCESS);
    } else {
      io.to(chatRoomId).emit(MESSAGE_FAILED);
    }
  });

  socket.on(MAKE_OFFLINE, async (data) => {
    const { userId } = data;

    await handlers.setUserOffline(userId);
  });

  socket.on(JOIN_GROUP_ROOM, async (data) => {
    const groupId = data.groupId;

    socket.join(groupId);

    const groupRoomData = await handlers.openGroupRoom(groupId);

    io.to(groupId).emit(POPULATE_GROUP_CHAT, groupRoomData);
  });

  socket.on(SEND_GROUP_MESSAGE, async (data) => {
    const { groupId, creatorUsername, text, senderUserId } = data;

    const insertResult = await handlers.insertGroupMessage(
      groupId,
      creatorUsername,
      text,
      senderUserId
    );

    if (insertResult.success) {
      io.to(groupId).emit(POPULATE_GROUP_CHAT);
      io.to(groupId).emit(GROUP_MESSAGE_SUCCESS);
    } else {
      io.to(groupId).emit(GROUP_MESSAGE_FAILED);
    }
  });

  socket.on(SEND_VOTE, async (data) => {
    const { groupId, pollId, userId, decisionBoolean } = data;

    const sendVoteResult = await handlers.submitVote(
      pollId,
      userId,
      decisionBoolean
    );
    if (sendVoteResult.success) {
      io.to(groupId).emit(POPULATE_GROUP_CHAT);
      io.to(groupId).emit(VOTE_SUCCESS);
    } else {
      io.to(groupId).emit(VOTE_FAILED, sendVoteResult);
    }
  });

  socket.on(CREATE_POLL, async (data) => {
    const { pollName, groupId, userId, creatorUsername } = data;

    const createPollResult = await handlers.createPoll(
      pollName,
      groupId,
      userId,
      creatorUsername
    );

    if (createPollResult.success) {
      io.to(groupId).emit(POPULATE_GROUP_CHAT);
      io.to(groupId).emit(CREATE_POLL_SUCCESS);
    } else {
      io.to(groupId).emit(CREATE_POLL_FAILED, createPollResult);
    }
  });

  socket.on(JOIN_LIST, async (data) => {
    const { message, userId, username, groupId } = data;

    console.log('Joining list....');

    const joinListResult = await handlers.joinList(
      message,
      userId,
      username,
      groupId
    );

    if (joinListResult.success) {
      io.to(groupId).emit(POPULATE_GROUP_CHAT);
    }
  });
});

socketServer.listen(PORT, () => {
  console.log(`Server is running on: ${PORT}`);
  connectDB().then(({ client, endPool }) => {
    console.log('DB is running');
    client.release();
    endPool();
  });
});
