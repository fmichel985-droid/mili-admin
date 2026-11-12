const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const MY_TELEGRAM_ID = process.env.MY_TELEGRAM_ID;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const users = {}; 

// Приём данных
app.post('/register', (req, res) => {
  const { userId, country, city, device } = req.body;
  if (!userId) return res.status(400).json({ error: 'no id' });

  const isNew = !users[userId];
  if (isNew) {
    users[userId] = {
      id: userId,
      country: country || '—',
      city: city || '—',
      device: device || '—',
      firstSeen: new Date().toLocaleString('ru-RU'),
      lastSeen: new Date().toLocaleString('ru-RU'),
      online: true,
      blocked: false
    };
    bot.sendMessage(MY_TELEGRAM_ID, 
      `🟢 Новый пользователь!\n\n` +
      `🆔 ID: ${userId}\n` +
      `🌍 Страна: ${users[userId].country}\n` +
      `🏙 Город: ${users[userId].city}\n` +
      `📱 Устройство: ${users[userId].device}\n` +
      `📅 Первый заход: ${users[userId].firstSeen}`
    ).catch(e => console.log(e));
  } else {
    users[userId].online = true;
    users[userId].lastSeen = new Date().toLocaleString('ru-RU');
  }
  res.json({ ok: true, blocked: users[userId].blocked });
});

// Офлайн
app.post('/offline', (req, res) => {
  const { userId } = req.body;
  if (users[userId]) {
    users[userId].online = false;
    users[userId].lastSeen = new Date().toLocaleString('ru-RU');
  }
  res.json({ ok: true });
});

// Проверка блокировки
app.get('/check/:userId', (req, res) => {
  const u = users[req.params.userId];
  res.json({ blocked: u ? u.blocked : false });
});

// Команды
bot.onText(/\/start/, (msg) => {
  if (String(msg.from.id) !== MY_TELEGRAM_ID) return;
  bot.sendMessage(msg.chat.id, '👋 Привет, админ!\n\n/list — список пользователей');
});

bot.onText(/\/list/, (msg) => {
  if (String(msg.from.id) !== MY_TELEGRAM_ID) return;
  const list = Object.values(users);
  if (list.length === 0) return bot.sendMessage(msg.chat.id, 'Пока никто не заходил.');

  list.forEach(u => {
    const status = u.online ? '🟢 Онлайн' : '⚫ Офлайн';
    const ban = u.blocked ? '🚫 ЗАБЛОКИРОВАН' : '';
    bot.sendMessage(msg.chat.id,
      `${status} ${ban}\n\n` +
      `🆔 ${u.id}\n` +
      `🌍 ${u.country}, ${u.city}\n` +
      `📱 ${u.device}\n` +
      `📅 Первый заход: ${u.firstSeen}\n` +
      `⏰ Последний: ${u.lastSeen}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: u.blocked ? '✅ Разблокировать' : '🚫 Заблокировать', callback_data: (u.blocked ? 'unban_' : 'ban_') + u.id }
          ]]
        }
      }
    ).catch(e => console.log(e));
  });
});

bot.on('callback_query', (query) => {
  if (String(query.from.id) !== MY_TELEGRAM_ID) return;
  const data = query.data;
  const [action, userId] = data.split('_');
  if (!users[userId]) return bot.answerCallbackQuery(query.id, { text: 'Не найден' });

  if (action === 'ban') {
    users[userId].blocked = true;
    bot.answerCallbackQuery(query.id, { text: 'Заблокирован' });
    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: '✅ Разблокировать', callback_data: 'unban_' + userId }]] },
      { chat_id: query.message.chat.id, message_id: query.message.message_id }
    ).catch(e => console.log(e));
  } else if (action === 'unban') {
    users[userId].blocked = false;
    bot.answerCallbackQuery(query.id, { text: 'Разблокирован' });
    bot.editMessageReplyMarkup(
      { inline_keyboard: [[{ text: '🚫 Заблокировать', callback_data: 'ban_' + userId }]] },
      { chat_id: query.message.chat.id, message_id: query.message.message_id }
    ).catch(e => console.log(e));
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server started on port ' + PORT));
