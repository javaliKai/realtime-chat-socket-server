const connectDB = require('../lib/db');

exports.findChatRoom = async (currentUserId, targetUserId) => {
  const { client, endPool } = await connectDB();
  try {
    const chatRoom = await client.query(
      `SELECT * FROM chatrooms WHERE (user_id_1=$1 AND user_id_2=$2) OR (user_id_1=$2 AND user_id_2=$1)`,
      [currentUserId, targetUserId]
    );

    if (chatRoom.rowCount === 0) {
      return null;
    }

    return Promise.resolve(chatRoom.rows[0]);
  } catch (error) {
    console.error('Error while finding chat room', error);

    return null;
  } finally {
    client.release();
    endPool();
  }
};

exports.openChatRoom = async (currentUserId, targetUserId) => {
  const result = {
    id: '',
    receiver: undefined,
    messages: {},
    error: '',
  };
  const { client, endPool } = await connectDB();
  try {
    // get the target user obj
    const targetUserQuery = await client.query(
      'SELECT id, username, is_online FROM users WHERE id=$1',
      [targetUserId]
    );
    if (targetUserQuery.rowCount === 0) {
      result.error = 'No target user found.';
      return result;
    }
    const targetUser = targetUserQuery.rows[0];
    result.receiver = targetUser;

    // find the existing chat room
    let chatRoom = await this.findChatRoom(currentUserId, targetUserId);

    // if no chatroom is found, add a new one and pass an empty array of messages
    if (!chatRoom) {
      await client.query(
        "INSERT INTO chatrooms(type, user_id_1, user_id_2) VALUES ('personal', $1, $2)",
        [currentUserId, targetUserId]
      );

      chatRoom = await this.findChatRoom(currentUserId, targetUserId);
      result.id = chatRoom.id;

      return result;
    }

    // if there is a chatroom found, then fetch all the messages and pass to the result
    result.id = chatRoom.id;
    const messagesQuery = await client.query(
      'SELECT * FROM messages WHERE chatroom_id=$1 ORDER BY timestamp',
      [chatRoom.id]
    );

    // modify the data to be divided by date
    const messages = messagesQuery.rows;

    // message will be grouped by date
    const groupedMessages = {};
    messages.forEach((message) => {
      const messageDate = new Date(message.timestamp);
      const groupKey = `${messageDate.getFullYear()}/${
        messageDate.getMonth() + 1
      }/${messageDate.getDate()}`;

      // if the date is in the group message, just add to that array, otherwise make a new one
      if (groupedMessages.hasOwnProperty(groupKey)) {
        groupedMessages[groupKey].push(message);
      } else {
        groupedMessages[groupKey] = [message];
      }
    });
    result.messages = groupedMessages;

    return result;
  } catch (error) {
    console.error('Error while opening chat room: ', error);
    result.error = 'Cannot open the chat room at the moment.';
  } finally {
    client.release();
    endPool();
    return result;
  }
};

exports.insertMessage = async (
  chatRoomId,
  creatorUsername,
  text,
  senderUserId
) => {
  const result = {
    success: false,
    error: '',
  };
  const { client, endPool } = await connectDB();
  try {
    await client.query(
      'INSERT INTO messages(chatroom_id, creator_id, creator_username, text) VALUES ($1, $2, $3, $4)',
      [chatRoomId, senderUserId, creatorUsername, text]
    );
    // grab the newly inserted data ID
    const topMessage = (
      await client.query(
        'SELECT * FROM messages WHERE chatroom_id=$1 ORDER BY timestamp DESC',
        [chatRoomId]
      )
    ).rows[0];

    // record the topmost messsage to the chatrooms table
    await client.query('UPDATE chatrooms SET last_message=$1 WHERE id=$2', [
      topMessage.id,
      chatRoomId,
    ]);

    result.success = true;
  } catch (error) {
    console.error('Error while sending message', error);
    result.error = 'Fail to send message!';
  } finally {
    client.release();
    endPool();
    return result;
  }
};

exports.openGroupRoom = async (groupId) => {
  // things needed: group info in groups table, how many members
  const result = {
    group: undefined,
    messages: {},
    totalMember: 0,
    error: '',
  };

  const { client, endPool } = await connectDB();

  try {
    // getting group info
    const groupQuery = await client.query('SELECT * FROM groups WHERE id=$1', [
      groupId,
    ]);
    const groupData = groupQuery.rows[0];
    if (groupQuery.rowCount !== 0) result.group = groupData;

    // getting how many members in the group
    const memberQuery = await client.query(
      'SELECT * FROM group_members WHERE group_id=$1',
      [groupId]
    );
    const memberCount = memberQuery.rowCount;
    result.totalMember = memberCount;

    // Getting group messages
    const messagesQuery = await client.query(
      'SELECT * FROM group_messages WHERE chatroom_id=$1 ORDER BY timestamp',
      [groupId]
    );
    // modify the data to be divided by date
    const messages = messagesQuery.rows;
    // message will be grouped by date
    const groupedMessages = {};
    messages.forEach((message) => {
      const messageDate = new Date(message.timestamp);
      const groupKey = `${messageDate.getFullYear()}/${
        messageDate.getMonth() + 1
      }/${messageDate.getDate()}`;

      // if the date is in the group message, just add to that array, otherwise make a new one
      if (groupedMessages.hasOwnProperty(groupKey)) {
        groupedMessages[groupKey].push(message);
      } else {
        groupedMessages[groupKey] = [message];
      }
    });
    result.messages = groupedMessages;
  } catch (error) {
    console.error('Error while opening group room: ', error);
    result.error = 'Cannot get group room info!';
  } finally {
    client.release();
    endPool();
    return result;
  }
};

exports.insertGroupMessage = async (
  groupId,
  creatorUsername,
  text,
  senderUserId
) => {
  const result = {
    success: false,
    error: '',
  };
  const { client, endPool } = await connectDB();

  console.log(text);

  try {
    // check whether it is a 'list' message
    const isList = /^#List\b/.test(text);

    console.log(isList);

    let type = 'text';
    if (isList) {
      type = 'list';
    }

    await client.query(
      'INSERT INTO group_messages(chatroom_id, creator_id, creator_username, text, type) VALUES ($1, $2, $3, $4, $5)',
      [groupId, senderUserId, creatorUsername, text, type]
    );

    // grab the newly inserted data ID
    const topMessage = (
      await client.query(
        'SELECT * FROM group_messages WHERE chatroom_id=$1 ORDER BY timestamp DESC',
        [groupId]
      )
    ).rows[0];

    // record the topmost messsage to the chatrooms table
    await client.query('UPDATE groups SET last_message=$1 WHERE id=$2', [
      topMessage.id,
      groupId,
    ]);

    result.success = true;
  } catch (error) {
    console.error('Error while sending message', error);
    result.error = 'Fail to send message!';
  } finally {
    client.release();
    endPool();
    return result;
  }
};

exports.submitVote = async (pollId, userId, decision) => {
  const result = {
    success: false,
    error: '',
  };

  const { client, endPool } = await connectDB();

  try {
    // reject vote if the user has been participated already
    const hasVoted =
      (
        await client.query(
          'SELECT * FROM group_poll_responses WHERE poll_id=$1 AND user_id=$2',
          [pollId, userId]
        )
      ).rowCount > 0;

    if (hasVoted) {
      result.error = 'Can only vote one time!';
      return result;
    }

    await client.query(
      'INSERT INTO group_poll_responses(poll_id, user_id, is_agree) VALUES ($1, $2, $3)',
      [pollId, userId, decision]
    );

    result.success = true;
  } catch (error) {
    console.error('Error while sending vote: ', error);
    result.error = 'Fail to submit vote.';
  } finally {
    client.release();
    endPool();
    return result;
  }
};

exports.createPoll = async (pollName, groupId, userId, creatorUsername) => {
  const result = {
    success: false,
    error: '',
  };

  const { client, endPool } = await connectDB();

  try {
    // record to group_polls table and grab the newly inserted data ID
    const latestPoll = (
      await client.query(
        'INSERT INTO group_polls(group_id, title, creator_id, creator_username) VALUES ($1, $2, $3, $4) RETURNING id',
        [groupId, pollName, userId, creatorUsername]
      )
    ).rows[0];

    // record the poll to the group_messages table
    await client.query(
      'INSERT INTO group_messages(chatroom_id, creator_id, creator_username, text, type) VALUES ($1, $2, $3, $4, $5)',
      [groupId, userId, creatorUsername, latestPoll.id, 'poll']
    );

    result.success = true;
  } catch (error) {
    console.error('Error while creating a poll: ', error);
    result.error = 'Fail to create a group poll.';
  } finally {
    client.release();
    endPool();
    return result;
  }
};

exports.joinList = async (message, userId, username, groupId) => {
  const result = {
    success: false,
    error: '',
  };

  const { client, endPool } = await connectDB();

  try {
    // Todo: check whether name is already on the list

    // grab the numbers
    const numbers = message.match(/\d+(?=\.)/g).map(Number);

    // grab the last number
    const lastNumber = numbers[numbers.length - 1];

    // construct the new message by adding the new user to the list
    const updatedList = `${message}\n${lastNumber + 1}. ${username}`;

    // create the new message in the group_messages table
    await client.query(
      'INSERT INTO group_messages(chatroom_id, creator_id, creator_username, text, type) VALUES ($1, $2, $3, $4, $5)',
      [groupId, userId, username, updatedList, 'list']
    );

    result.success = true;
  } catch (error) {
    console.error('Error while joining a list: ', error);
    result.error = 'Fail to join group list.';
  } finally {
    client.release();
    endPool();
    return result;
  }
};

exports.setUserOffline = async (userId) => {
  const result = {
    success: false,
    error: '',
  };

  const { client, endPool } = await connectDB();

  try {
    await client.query('UPDATE users SET is_online=false WHERE id=$1', [
      userId,
    ]);

    result.success = true;
  } catch (error) {
    console.error('Error while setting user offline: ', error);
    result.error = 'Fail to set user offline.';
  } finally {
    client.release();
    endPool();
    return result;
  }
};
