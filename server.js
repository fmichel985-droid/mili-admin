const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const MY_TELEGRAM_ID = process.env.MY_TELEGRAM_ID;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const users = {}; 
const inbox = {};
const promos = {}; 

function sendTelegram(msg, opts) {
  bot.sendMessage(MY_TELEGRAM_ID, msg, opts || { parse_mode: 'HTML' }).catch(e => console.log(e));
}

// --- API ДЛЯ ИГРЫ ---
app.get('/api/register', (req, res) => {
  const { userId, country, city, device, petName, isSupport } = req.query;
  if (!userId) return res.status(400).json({ error: 'no id' });
  const now = new Date().toLocaleString('ru-RU');
  const isNew = !users[userId];

  if (isNew) {
    users[userId] = {
      id: userId, country: country || '—', city: city || '—', device: device || '—',
      petName: petName || 'Мили', firstSeen: now, lastSeen: now,
      online: true, blocked: false, blockUntil: 0, isVip: false, note: ""
    };
    if (!isSupport) {
      sendTelegram(`🟢 <b>Новый пользователь!</b>\n\n🆔 ID: <code>${userId}</code>\n🐾 Питомец: ${users[userId].petName}\n🌍 ${users[userId].country}, ${users[userId].city}\n📱 ${users[userId].device}\n📅 ${users[userId].firstSeen}`);
    }
  } else {
    users[userId].online = true; users[userId].lastSeen = now; if (petName) users[userId].petName = petName;
  }

  if (isSupport === 'true') {
    sendTelegram(`🆘 <b>ОБРАЩЕНИЕ В ТЕХПОДДЕРЖКУ!</b>\n\n🆔 ID: <code>${userId}</code>\n🐾 Питомец: ${users[userId].petName}\n🌍 ${users[userId].country}, ${users[userId].city}\n📱 ${users[userId].device}\n📅 ${now}`);
  }

  const isBlocked = users[userId].blocked || (users[userId].blockUntil > Date.now());
  res.json({ ok: true, blocked: isBlocked, isVip: users[userId].isVip });
});

app.get('/api/offline', (req, res) => {
  const { userId } = req.query;
  if (users[userId] && users[userId].online) { users[userId].online = false; users[userId].lastSeen = new Date().toLocaleString('ru-RU'); }
  res.json({ ok: true });
});

app.get('/check/:userId', (req, res) => {
  const u = users[req.params.userId];
  let isBlocked = false;
  if (u) {
    if (u.blocked) isBlocked = true;
    else if (u.blockUntil > Date.now()) isBlocked = true;
    else if (u.blockUntil > 0 && u.blockUntil <= Date.now()) { u.blockUntil = 0; isBlocked = false; }
  }
  res.json({ blocked: isBlocked, isVip: u ? u.isVip : false });
});

app.get('/api/promo', (req, res) => {
  const { userId, code } = req.query;
  if (!userId || !code) return res.json({ ok: false, error: 'Нет данных' });
  const promo = promos[code.toUpperCase()];
  if (!promo) return res.json({ ok: false, error: 'Промокод не найден' });
  if (promo.usedBy.includes(userId)) return res.json({ ok: false, error: 'Вы уже использовали этот код' });
  promo.usedBy.push(userId);
  res.json({ ok: true, reward: promo.reward });
});

app.get('/get-message/:userId', (req, res) => {
  const userId = req.params.userId;
  if (inbox[userId] && inbox[userId].length > 0) {
    const item = inbox[userId].shift();
    res.json({ message: item.text || null, photo: item.photo || null });
  } else {
    res.json({ message: null, photo: null });
  }
});

// --- КОМАНДЫ БОТА ---
bot.onText(/\/start/, (msg) => {
  if (String(msg.from.id) !== MY_TELEGRAM_ID) return;
  bot.sendMessage(msg.chat.id, '👋 Привет, админ!\n\n/list — пользователи\n/stats — статистика\n/newpromo — создать промокод\n/listpromo — список промокодов\n/deletepromo — удалить промокод');
});

bot.onText(/\/list/, (msg) => {
  if (String(msg.from.id) !== MY_TELEGRAM_ID) return;
  const list = Object.values(users);
  if (list.length === 0) return bot.sendMessage(msg.chat.id, 'Пока никто не заходил.');
  list.forEach(u => {
    const status = u.online ? '🟢 Онлайн' : '⚫ Офлайн';
    let banInfo = '';
    if (u.blocked) banInfo = '\n🚫 <b>ЗАБЛОКИРОВАН</b>';
    else if (u.blockUntil > Date.now()) banInfo = `\n🚫 <b>БАН ${Math.ceil((u.blockUntil - Date.now()) / 3600000)} ч.</b>`;
    const vipMark = u.isVip ? '\n⭐ <b>VIP</b>' : '';
    const noteMark = u.note ? `\n📝 <i>${u.note}</i>` : '';

    bot.sendMessage(msg.chat.id,
      `${status}${banInfo}${vipMark}${noteMark}\n\n🐾 <b>${u.petName}</b>\n🆔 <code>${u.id}</code>\n🌍 ${u.country}, ${u.city}\n📱 ${u.device}\n📅 Первый: ${u.firstSeen}\n⏰ Последний: ${u.lastSeen}`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [
        [{ text: u.blocked ? '✅ Разблокировать' : '🚫 Бан навсегда', callback_data: (u.blocked ? 'unban_' : 'ban_') + u.id }, { text: '⏳ Бан 24ч', callback_data: 'ban24_' + u.id }],
        [{ text: '💬 Написать', callback_data: 'msg_' + u.id }, { text: '🖼 Фото', callback_data: 'photo_' + u.id }],
        [{ text: u.isVip ? '❌ Снять VIP' : '👑 Выдать VIP', callback_data: 'vip_' + u.id }, { text: '📝 Заметка', callback_data: 'note_' + u.id }]
      ] } }
    ).catch(e => console.log(e));
  });
});

bot.onText(/\/stats/, (msg) => {
  if (String(msg.from.id) !== MY_TELEGRAM_ID) return;
  const list = Object.values(users);
  bot.sendMessage(msg.chat.id, `📊 <b>Статистика</b>\n\n👥 Всего: <b>${list.length}</b>\n🟢 Онлайн: <b>${list.filter(u => u.online).length}</b>\n🚫 Забанено: <b>${list.filter(u => u.blocked || u.blockUntil > Date.now()).length}</b>\n⭐ VIP: <b>${list.filter(u => u.isVip).length}</b>`, { parse_mode: 'HTML' });
});

bot.onText(/\/newpromo/, (msg) => {
  if (String(msg.from.id) !== MY_TELEGRAM_ID) return;
  bot.sendMessage(msg.chat.id, 'Введите код и награду через пробел (например: MILI 500):', { reply_markup: { force_reply: true } }).then(sentMsg => {
    bot.onReplyToMessage(msg.chat.id, sentMsg.message_id, (reply) => {
      const parts = reply.text.split(' ');
      if (parts.length < 2 || isNaN(parts[1])) return bot.sendMessage(msg.chat.id, 'Ошибка. Формат: КОД НАГРАДА');
      const code = parts[0].toUpperCase(); const reward = parseInt(parts[1]);
      promos[code] = { reward: reward, usedBy: [] };
      bot.sendMessage(msg.chat.id, `✅ Промокод <b>${code}</b> создан на ${reward} 🪙!`, { parse_mode: 'HTML' });
    });
  });
});

bot.onText(/\/listpromo/, (msg) => {
  if (String(msg.from.id) !== MY_TELEGRAM_ID) return;
  const keys = Object.keys(promos);
  if (keys.length === 0) return bot.sendMessage(msg.chat.id, 'Промокодов нет.');
  let text = '📋 <b>Действующие промокоды:</b>\n\n';
  keys.forEach(k => { text += `<code>${k}</code> — ${promos[k].reward} 🪙 (использован: ${promos[k].usedBy.length} раз)\n`; });
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
});

bot.onText(/\/deletepromo/, (msg) => {
  if (String(msg.from.id) !== MY_TELEGRAM_ID) return;
  bot.sendMessage(msg.chat.id, 'Введите код для удаления:', { reply_markup: { force_reply: true } }).then(sentMsg => {
    bot.onReplyToMessage(msg.chat.id, sentMsg.message_id, (reply) => {
      const code = reply.text.toUpperCase();
      if (promos[code]) { delete promos[code]; bot.sendMessage(msg.chat.id, `✅ Промокод ${code} удален.`); }
      else { bot.sendMessage(msg.chat.id, '❌ Такого кода нет.'); }
    });
  });
});

bot.on('callback_query', (query) => {
  if (String(query.from.id) !== MY_TELEGRAM_ID) return;
  const data = query.data;
  const [action, userId] = data.split('_');
  if (!users[userId]) return bot.answerCallbackQuery(query.id, { text: 'Не найден' });

  if (action === 'ban') { users[userId].blocked = true; bot.answerCallbackQuery(query.id, { text: 'Забанен' }); updateKeyboard(query, userId); } 
  else if (action === 'ban24') { users[userId].blocked = false; users[userId].blockUntil = Date.now() + 86400000; bot.answerCallbackQuery(query.id, { text: 'Бан 24ч' }); updateKeyboard(query, userId); }
  else if (action === 'unban') { users[userId].blocked = false; users[userId].blockUntil = 0; bot.answerCallbackQuery(query.id, { text: 'Разбанен' }); updateKeyboard(query, userId); }
  else if (action === 'msg') {
    bot.answerCallbackQuery(query.id);
    bot.sendMessage(query.message.chat.id, `Введите текст для ${users[userId].petName}:`, { reply_markup: { force_reply: true } }).then(sentMsg => {
      bot.onReplyToMessage(query.message.chat.id, sentMsg.message_id, (reply) => {
        if (reply.text === '/cancel') return bot.sendMessage(query.message.chat.id, 'Отменено.');
        if (!inbox[userId]) inbox[userId] = [];
        inbox[userId].push({ text: reply.text });
        bot.sendMessage(query.message.chat.id, `✅ Отправлено!`);
      });
    });
  }
  else if (action === 'photo') {
    bot.answerCallbackQuery(query.id);
    bot.sendMessage(query.message.chat.id, `Отправьте фото для ${users[userId].petName}:`, { reply_markup: { force_reply: true } }).then(sentMsg => {
      bot.onReplyToMessage(query.message.chat.id, sentMsg.message_id, (reply) => {
        if (reply.photo) {
          const photoId = reply.photo[reply.photo.length - 1].file_id;
          if (!inbox[userId]) inbox[userId] = [];
          inbox[userId].push({ text: reply.caption || "Фото от админа!", photo: photoId });
          bot.sendMessage(query.message.chat.id, `✅ Фото отправлено!`);
        } else { bot.sendMessage(query.message.chat.id, 'Вы отправили не фото.'); }
      });
    });
  }
  else if (action === 'vip') { users[userId].isVip = !users[userId].isVip; bot.answerCallbackQuery(query.id, { text: users[userId].isVip ? 'VIP выдан' : 'VIP снят' }); updateKeyboard(query, userId); }
  else if (action === 'note') {
    bot.answerCallbackQuery(query.id);
    bot.sendMessage(query.message.chat.id, `Введите заметку для ${users[userId].petName} (или /cancel):`, { reply_markup: { force_reply: true } }).then(sentMsg => {
      bot.onReplyToMessage(query.message.chat.id, sentMsg.message_id, (reply) => {
        if (reply.text === '/cancel') return bot.sendMessage(query.message.chat.id, 'Отменено.');
        users[userId].note = reply.text;
        bot.sendMessage(query.message.chat.id, `✅ Заметка сохранена!`); updateKeyboard(query, userId);
      });
    });
  }
});

function updateKeyboard(query, userId) {
  const u = users[userId];
  let banInfo = '';
  if (u.blocked) banInfo = '\n🚫 <b>ЗАБЛОКИРОВАН НАВСЕГДА</b>';
  else if (u.blockUntil > Date.now()) banInfo = `\n🚫 <b>БАН ${Math.ceil((u.blockUntil - Date.now()) / 3600000)} ч.</b>`;
  const vipMark = u.isVip ? '\n⭐ <b>VIP</b>' : '';
  const noteMark = u.note ? `\n📝 <i>${u.note}</i>` : '';
  
  bot.editMessageText(
    `${u.online ? '🟢 Онлайн' : '⚫ Офлайн'}${banInfo}${vipMark}${noteMark}\n\n🐾 <b>${u.petName}</b>\n🆔 <code>${u.id}</code>\n🌍 ${u.country}, ${u.city}\n📱 ${u.device}\n📅 Первый: ${u.firstSeen}\n⏰ Последний: ${u.lastSeen}`,
    { chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: 'HTML', reply_markup: { inline_keyboard: [
      [{ text: u.blocked ? '✅ Разблокировать' : '🚫 Бан навсегда', callback_data: (u.blocked ? 'unban_' : 'ban_') + u.id }, { text: '⏳ Бан 24ч', callback_data: 'ban24_' + u.id }],
      [{ text: '💬 Написать', callback_data: 'msg_' + u.id }, { text: '🖼 Фото', callback_data: 'photo_' + u.id }],
      [{ text: u.isVip ? '❌ Снять VIP' : '👑 Выдать VIP', callback_data: 'vip_' + u.id }, { text: '📝 Заметка', callback_data: 'note_' + u.id }]
    ] } }
  ).catch(e => console.log(e));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server started on port ' + PORT));
