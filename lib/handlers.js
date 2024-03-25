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
  try {
    await client.query(
      'INSERT INTO group_messages(chatroom_id, creator_id, creator_username, text) VALUES ($1, $2, $3, $4)',
      [groupId, senderUserId, creatorUsername, text]
    );

    // grab the newly inserted data ID
    const topMessage = (
      await client.query(
        'SELECT * FROM messages WHERE chatroom_id=$1 ORDER BY timestamp DESC',
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
