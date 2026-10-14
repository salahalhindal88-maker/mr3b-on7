require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Partials, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, StringSelectMenuBuilder, AuditLogEvent } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.Message, Partials.Channel, Partials.User]
});
const tempRatings = new Map();
const activeTimers = new Map(); 
const tournamentMatches = new Map();
const DB_PATH = './ratings_database.json';
async function sendServerLog(guild, description, color = '#5865f2') {
    const logChannel = guild.channels.cache.find(channel =>
        channel.isTextBased() && channel.name === 'log〡📁'
    );

    if (!logChannel || typeof logChannel.send !== 'function') {
        console.error(`Log channel "log〡📁" not found in guild ${guild.id}.`);
        return;
    }

    try {
        await logChannel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(color)
                    .setDescription(description.slice(0, 4000))
                    .setTimestamp()
            ]
        });
    } catch (error) {
        console.error(`Failed to send server log in guild ${guild.id}:`, error);
    }
}

async function findRecentAuditEntry(guild, type, targetId) {
    try {
        const logs = await guild.fetchAuditLogs({ type, limit: 5 });
        return logs.entries.find(entry =>
            entry.target?.id === targetId && Date.now() - entry.createdTimestamp < 10_000
        ) || null;
    } catch (error) {
        console.error(`Failed to fetch audit logs for guild ${guild.id}:`, error);
        return null;
    }
}

function getDatabase() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ brokers: {}, teamsStats: {} }, null, 4));
    }
    try { 
        const data = fs.readFileSync(DB_PATH, 'utf8');
        const parsed = JSON.parse(data || '{"brokers":{},"teamsStats":{}}');
        if (!parsed.teamsStats) parsed.teamsStats = {};
        if (!parsed.brokers) parsed.brokers = {};
        return parsed;
    } catch (e) { 
        return { brokers: {}, teamsStats: {} }; 
    }
}
function saveRatingToDB(brokerId, treatment, speed, ticketOwner = "عضو غير حدد", ticketReason = "لا يوجد سبب") {
    const db = getDatabase();
    if (!db.brokers[brokerId]) {
        db.brokers[brokerId] = { totalOperations: 0, treatment: { excellent: 0, good: 0, bad: 0 }, speed: { excellent: 0, good: 0, bad: 0 }, history: [] };
    }
    const broker = db.brokers[brokerId]; if (!broker.history) broker.history = []; 
    broker.totalOperations += 1;
    if (treatment === 'ممتاز') broker.treatment.excellent += 1;
    if (treatment === 'جيد') broker.treatment.good += 1;
    if (treatment === 'سيئ') broker.treatment.bad += 1;
    if (speed === 'ممتاز') broker.speed.excellent += 1;
    if (speed === 'جيد') broker.speed.good += 1;
    if (speed === 'سيئ') broker.speed.bad += 1;
    const timestampStr = new Date().toLocaleString('ar-EG', { timeZone: 'Asia/Riyadh' });
    const operationLog = { owner: ticketOwner, reason: ticketReason, time: timestampStr, rate: `💬 ${treatment} | ⚡ ${speed}` };
    broker.history.unshift(operationLog);
    if (broker.history.length > 3) broker.history = broker.history.slice(0, 3);
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 4));
}
function updateTeamMatchStats(winnerName, loserName) {
    const db = getDatabase();
    const cleanWin = winnerName.trim(); const cleanLose = loserName.trim();
    if (!db.teamsStats[cleanWin]) db.teamsStats[cleanWin] = { name: cleanWin, wins: 0, losses: 0, matches: 0, points: 0 };
    if (!db.teamsStats[cleanLose]) db.teamsStats[cleanLose] = { name: cleanLose, wins: 0, losses: 0, matches: 0, points: 0 };
    db.teamsStats[cleanWin].wins += 1; db.teamsStats[cleanWin].matches += 1; db.teamsStats[cleanWin].points += 3; 
    db.teamsStats[cleanLose].losses += 1; db.teamsStats[cleanLose].matches += 1;
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 4));
}
function createBrokerEmbed(bData, brokerId, guildIcon) {
    const total = Math.round(bData?.totalOperations) || 0;
    const treatExcellent = Math.round(bData?.treatment?.excellent) || 0;
    const treatGood = Math.round(bData?.treatment?.good) || 0;
    const treatBad = Math.round(bData?.treatment?.bad) || 0;
    const speedExcellent = Math.round(bData?.speed?.excellent) || 0;
    const speedGood = Math.round(bData?.speed?.good) || 0;
    const speedBad = Math.round(bData?.speed?.bad) || 0;
    const treatExPercent = total > 0 ? Math.round((treatExcellent / total) * 100) : 0;
    const speedExPercent = total > 0 ? Math.round((speedExcellent / total) * 100) : 0;
    const embed = new EmbedBuilder().setColor('#3498db').setTitle(`📊 السجل المهني وإحصائيات التقييم الكلي للوسيط`).setDescription(`ملف البيانات للوسيط: <@${brokerId}>`)
        .addFields(
            { name: '💼 إجمالي العمليات:', value: `\`${total}\` عملية`, inline: false },
            { name: '💬 تقييمات التعامل:', value: `👑 ممتاز: \`${treatExcellent}\` (\${treatExPercent}%)\n🟡 جيد: \`${treatGood}\` \n🔴 سيئ: \`${treatBad}\``, inline: true },
            { name: '⚡ تقييمات السرعة:', value: `👑 ممتاز: \`${speedExcellent}\` (\${speedExPercent}%)\n🟡 جيد: \`${speedGood}\` \n🔴 سيئ: \`${speedBad}\``, inline: true }
        ).setTimestamp();
    let historyText = "";
    if (bData && bData.history && bData.history.length > 0) {
        bData.history.forEach((op, index) => { historyText += `🔹 **العملية ${index + 1}:**\n└ صاحب التقييم: ${op.owner}\n└ الغرفة: \`${op.reason}\`\n└ التقييم: ${op.rate}\n\n`; });
    } else { historyText = "*❌ لا يوجد سجل عمليات حالياً.*"; }
    embed.addFields({ name: '📝 سجل آخر 3 عمليات منفذة للوسيط:', value: historyText, inline: false }); return embed;
}
function parseDuration(timeStr) {
    const pureNum = parseInt(timeStr.replace(/\D/g, ''));
    let totalMs = 0; if (isNaN(pureNum)) return 0;
    if (timeStr.includes('h') || timeStr.includes('ساعة')) { totalMs = pureNum * 60 * 60 * 1000; }
    else if (timeStr.includes('m') || timeStr.includes('دقيقة') || timeStr.includes('د')) { totalMs = pureNum * 60 * 1000; }
    else if (timeStr.includes('s') || timeStr.includes('ثانية') || timeStr.includes('ث')) { totalMs = pureNum * 1000; }
    else { totalMs = pureNum * 60 * 1000; }
    return totalMs;
}

const teamsSlashCommand = new SlashCommandBuilder().setName('الافرقه').setDescription('🛠️ تفكيك وتوزيع صلاحيات رومات التيمات المفتوحة مسبقاً ونشر جدول مواجهات الفرق للكل.');
teamsSlashCommand.addStringOption(opt => opt.setName('تيم_1').setDescription('منشن لاعبي تيم 1 بمسافات').setRequired(true));
for (let i = 2; i <= 16; i++) { teamsSlashCommand.addStringOption(opt => opt.setName(`تيم_${i}`).setDescription(`منشن لاعبي تيم ${i} بمسافات (اختياري)`).setRequired(false)); }
client.once('ready', async () => {
    console.log("==========================================");
    console.log("ALL SYSTEMS ONLINE - CORE TOURNAMENT SYSTEMS RUNNING STABLE");
    console.log("==========================================");
    try {
        const rest = new REST({ version: '10' }).setToken(config.token);
        const commands = [
            new SlashCommandBuilder().setName('المتصدرون').setDescription('🏆 عرض قائمة جميع وسطاء السيرفر مرتبين من الأعلى تقييماً إلى الأقل.'),
            new SlashCommandBuilder().setName('مواجهة').setDescription('⚔️ إنشاء جدول مواجهة وبطاقة نزال فخمة للفرق بالبطولة.').addStringOption(o => o.setName('الفريق_الأول').setDescription('منشن لاعبي الفريق الأول').setRequired(true)).addStringOption(o => o.setName('الفريق_الثاني').setDescription('منشن لاعبي الفريق الثاني').setRequired(true)),
            new SlashCommandBuilder().setName('فوز').setDescription('👑 إعلان وتتويج بطل السيرفر الجديد ونقل رتبة WINNER وتصفير الموسم.').addUserOption(o => o.setName('البطل').setDescription('منشن اللاعب الفائز لتتويجه باللقب الحين').setRequired(true)),
            new SlashCommandBuilder().setName('احصائيات').setDescription('📊 تسجيل نتيجة نزالات جولات البطولة وعرض جدول ترتيب إحصائيات كل الفرق.').addStringOption(o => o.setName('الفريق_الفائز').setDescription('اكتب اسم الفريق الفائز').setRequired(true)).addStringOption(o => o.setName('الفريق_الخاسر').setDescription('اكتب اسم الفريق الخاسر').setRequired(true)).addStringOption(o => o.setName('النتيجة').setDescription('اكتب نتيجة الجولة بالأرقام').setRequired(true)),
            teamsSlashCommand
        ].map(cmd => cmd.toJSON());
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`Registered ${commands.length} global slash commands.`);
    } catch (error) {
        console.error('Failed to register global slash commands:', error);
    }
});
client.on('guildMemberAdd', async (member) => {
    await sendServerLog(member.guild, `📥 انضم للسيرفر: ${member} (\`${member.user.tag}\`)`);

    const memberRole = member.guild.roles.cache.find(role => role.name === 'Member');
    if (!memberRole) {
        console.error(`Member role not found in guild ${member.guild.id}.`);
    } else {
        try {
            await member.roles.add(memberRole);
        } catch (error) {
            console.error(`Failed to assign Member role to ${member.id}:`, error);
        }
    }

    const welcomeChannel = member.guild.channels.cache.find(channel =>
        channel.isTextBased() && channel.name === 'الترحيب・〡welcome👋🏻'
    );

    if (!welcomeChannel) {
        console.error(`Welcome channel not found in guild ${member.guild.id}.`);
        return;
    }

    const welcomeEmbed = new EmbedBuilder()
        .setColor('#3498db')
        .setDescription(
            `👋🏻 أهلاً وسهلاً بك ${member}!\n\n` +
            `🔥 نورت مجتمع **TAVRO ◈ TEAM** الخاص بـ Roblox.\n\n` +
            `استمتع باللعب وتعرّف على الأعضاء، ولا تنسَ قراءة القوانين. ` +
            `إذا احتجت أي مساعدة، تواصل مع الإدارة.\n\n` +
            `نتمنى لك وقتاً ممتعاً!`
        )
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: `أنت العضو رقم ${member.guild.memberCount}` })
        .setTimestamp();

    try {
        await welcomeChannel.send({ embeds: [welcomeEmbed] });
    } catch (error) {
        console.error(`Failed to send welcome message for member ${member.id}:`, error);
    }
});
client.on('guildMemberRemove', async (member) => {
    const banEntry = await findRecentAuditEntry(member.guild, AuditLogEvent.MemberBanAdd, member.id);
    if (banEntry) return;

    const kickEntry = await findRecentAuditEntry(member.guild, AuditLogEvent.MemberKick, member.id);
    if (kickEntry) {
        const reason = kickEntry.reason ? `\nالسبب: ${kickEntry.reason}` : '';
        return sendServerLog(
            member.guild,
            `👢 تم طرد ${member.user} بواسطة <@${kickEntry.executorId}>.${reason}`,
            '#e67e22'
        );
    }

    await sendServerLog(member.guild, `📤 غادر السيرفر: ${member.user.tag} (\`${member.id}\`)`, '#e74c3c');
});

client.on('guildBanAdd', async (ban) => {
    const entry = await findRecentAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    const executor = entry?.executorId ? `<@${entry.executorId}>` : 'غير معروف';
    const reason = entry?.reason ? `\nالسبب: ${entry.reason}` : '';
    await sendServerLog(
        ban.guild,
        `🔨 تم حظر ${ban.user.tag} (\`${ban.user.id}\`) بواسطة ${executor}.${reason}`,
        '#992d22'
    );
});

client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    const entry = await findRecentAuditEntry(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    const executor = entry?.executorId ? `<@${entry.executorId}>` : 'غير معروف';
    await sendServerLog(
        channel.guild,
        `🆕 تم إنشاء روم **${channel.name}** بواسطة ${executor}.`,
        '#2ecc71'
    );
});

client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    const entry = await findRecentAuditEntry(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    const executor = entry?.executorId ? `<@${entry.executorId}>` : 'غير معروف';
    await sendServerLog(
        channel.guild,
        `🗑️ تم حذف الروم **${channel.name}** بواسطة ${executor}.`,
        '#e74c3c'
    );
});

client.on('channelUpdate', async (oldChannel, newChannel) => {
    if (!newChannel.guild) return;
    const changes = [];
    if (oldChannel.name !== newChannel.name) {
        changes.push(`الاسم: **${oldChannel.name}** ← **${newChannel.name}**`);
    }
    if (oldChannel.parentId !== newChannel.parentId) {
        changes.push(`الفئة: **${oldChannel.parent?.name || 'بدون فئة'}** ← **${newChannel.parent?.name || 'بدون فئة'}**`);
    }
    if ('topic' in oldChannel && 'topic' in newChannel && oldChannel.topic !== newChannel.topic) {
        changes.push(`الوصف: **${oldChannel.topic || 'بدون وصف'}** ← **${newChannel.topic || 'بدون وصف'}**`);
    }
    if (!changes.length) return;

    const entry = await findRecentAuditEntry(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    const executor = entry?.executorId ? `<@${entry.executorId}>` : 'غير معروف';
    await sendServerLog(
        newChannel.guild,
        `🛠️ تم تعديل الروم <#${newChannel.id}> بواسطة ${executor}.\n${changes.join('\n')}`,
        '#f1c40f'
    );
});

client.on('roleCreate', async (role) => {
    const entry = await findRecentAuditEntry(role.guild, AuditLogEvent.RoleCreate, role.id);
    const executor = entry?.executorId ? `<@${entry.executorId}>` : 'غير معروف';
    await sendServerLog(role.guild, `🆕 تم إنشاء الرتبة **${role.name}** بواسطة ${executor}.`, '#2ecc71');
});

client.on('roleDelete', async (role) => {
    const entry = await findRecentAuditEntry(role.guild, AuditLogEvent.RoleDelete, role.id);
    const executor = entry?.executorId ? `<@${entry.executorId}>` : 'غير معروف';
    await sendServerLog(role.guild, `🗑️ تم حذف الرتبة **${role.name}** بواسطة ${executor}.`, '#e74c3c');
});

client.on('roleUpdate', async (oldRole, newRole) => {
    const changes = [];
    if (oldRole.name !== newRole.name) {
        changes.push(`الاسم: **${oldRole.name}** ← **${newRole.name}**`);
    }
    if (oldRole.color !== newRole.color) {
        changes.push(`اللون تغير من \`${oldRole.hexColor}\` إلى \`${newRole.hexColor}\``);
    }
    if (oldRole.hoist !== newRole.hoist) {
        changes.push(`تغيير إظهار الرتبة منفصلة: **${newRole.hoist ? 'مفعل' : 'معطل'}**`);
    }
    if (!changes.length) return;

    const entry = await findRecentAuditEntry(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    const executor = entry?.executorId ? `<@${entry.executorId}>` : 'غير معروف';
    await sendServerLog(
        newRole.guild,
        `🛠️ تم تعديل الرتبة **${newRole.name}** بواسطة ${executor}.\n${changes.join('\n')}`,
        '#f1c40f'
    );
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    if (!oldState.channel && newState.channel) {
        await sendServerLog(member.guild, `🔊 دخل ${member} إلى الروم الصوتي ${newState.channel}.`);
    } else if (oldState.channel && !newState.channel) {
        await sendServerLog(member.guild, `🔇 غادر ${member} الروم الصوتي ${oldState.channel}.`);
    } else if (oldState.channel && newState.channel && oldState.channelId !== newState.channelId) {
        await sendServerLog(
            member.guild,
            `🔀 انتقل ${member} من ${oldState.channel} إلى ${newState.channel}.`
        );
    }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const changes = [];
    const oldTimeout = oldMember.communicationDisabledUntilTimestamp;
    const newTimeout = newMember.communicationDisabledUntilTimestamp;

    if (oldTimeout !== newTimeout) {
        if (newTimeout) {
            changes.push(`⏳ تم إعطاء ${newMember} تايم أوت حتى <t:${Math.floor(newTimeout / 1000)}:F>.`);
        } else {
            changes.push(`✅ انتهى التايم أوت عن ${newMember}.`);
        }
    }

    if (oldMember.nickname !== newMember.nickname) {
        changes.push(
            `✏️ تغير اسم ${newMember} من **${oldMember.nickname || oldMember.user.username}** إلى **${newMember.nickname || newMember.user.username}**.`
        );
    }

    const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
    const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
    if (addedRoles.size) {
        changes.push(`➕ أضيفت إلى ${newMember} الرتب: ${addedRoles.map(role => role.name).join('، ')}.`);
    }
    if (removedRoles.size) {
        changes.push(`➖ أزيلت من ${newMember} الرتب: ${removedRoles.map(role => role.name).join('، ')}.`);
    }

    for (const change of changes) {
        await sendServerLog(newMember.guild, change, '#f1c40f');
    }
});

client.on('messageDelete', async (message) => {
    if (!message.guild || message.author?.bot) return;
    const content = message.content?.trim();
    const details = content ? `\nالمحتوى: ${content.slice(0, 1000)}` : '\n(لا يتوفر محتوى الرسالة)';
    await sendServerLog(
        message.guild,
        `🗑️ حُذفت رسالة من ${message.author || 'عضو غير معروف'} في ${message.channel}.${details}`,
        '#e74c3c'
    );
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    const oldContent = oldMessage.content?.trim() || '(لا يتوفر المحتوى السابق)';
    const newContent = newMessage.content?.trim() || '(لا يتوفر المحتوى الجديد)';
    await sendServerLog(
        newMessage.guild,
        `📝 عُدلت رسالة ${newMessage.author || 'عضو غير معروف'} في ${newMessage.channel}.\nقبل: ${oldContent.slice(0, 1000)}\nبعد: ${newContent.slice(0, 1000)}`,
        '#3498db'
    );
});

client.on('messageCreate', async (message) => {
    if (message.author.id === client.user.id) return;
    const rawText = message.content.trim(); const currentMsgText = rawText; const lowerStr = rawText.toLowerCase();
    const authorUser = message.author.username;

    if (currentMsgText === '#قفل' || currentMsgText === '#فتح') {
        if (!message.guild || !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ هذا الأمر مخصص لمن لديهم صلاحية Administrator فقط.');
        }
        if (!message.channel.isTextBased() || !message.channel.permissionOverwrites) {
            return message.reply('❌ يمكن استخدام هذا الأمر في الرومات النصية فقط.');
        }

        const shouldLock = currentMsgText === '#قفل';
        try {
            await message.channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                { SendMessages: shouldLock }
            );
            await message.reply(
                shouldLock
                    ? '🔒 تم قفل الشات، لا يمكن للأعضاء إرسال الرسائل الآن.'
                    : '🔓 تم فتح الشات، يمكن للأعضاء إرسال الرسائل الآن.'
            );
            await sendServerLog(
                message.guild,
                `${shouldLock ? '🔒 تم قفل' : '🔓 تم فتح'} الشات ${message.channel} بواسطة ${message.author}.`,
                shouldLock ? '#e74c3c' : '#2ecc71'
            );
        } catch (error) {
            console.error(`Failed to ${shouldLock ? 'lock' : 'unlock'} channel ${message.channel.id}:`, error);
            return message.reply('❌ تعذر تغيير صلاحيات الشات. تأكد أن رتبة البوت لديها Manage Channels.');
        }
        return;
    }

    if (currentMsgText.startsWith('#حذف')) {
        if (!message.guild || !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ هذا الأمر مخصص لمن لديهم صلاحية Administrator فقط.');
        }

        const match = currentMsgText.match(/^#حذف\s+(\d+)$/);
        const amount = match ? Number(match[1]) : 0;
        if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
            return message.reply('❌ اكتب العدد من 1 إلى 100 بهذا الشكل: `#حذف 10`');
        }

        if (!message.channel.isTextBased() || !message.channel.messages || !message.channel.bulkDelete) {
            return message.reply('❌ يمكن استخدام الأمر في الرومات النصية فقط.');
        }

        const botMember = message.guild.members.me;
        if (!botMember?.permissionsIn(message.channel).has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('❌ البوت يحتاج صلاحية Manage Messages في هذا الروم.');
        }

        try {
            const messages = await message.channel.messages.fetch({ limit: amount });
            const deletedMessages = amount === 1
                ? await Promise.all([...messages.values()].map(deleted => deleted.delete()))
                : await message.channel.bulkDelete(messages, true);
            const deletedCount = amount === 1 ? deletedMessages.length : deletedMessages.size;
            await message.channel.send(`🧹 تم حذف ${deletedCount} من أصل ${amount} رسالة.`);
            await sendServerLog(
                message.guild,
                `🧹 حذف ${message.author} عدد ${deletedCount} رسالة في ${message.channel}.`,
                '#e67e22'
            );
        } catch (error) {
            console.error(`Failed to bulk delete messages in channel ${message.channel.id}:`, error);
            return message.reply('❌ تعذر حذف الرسائل. قد تكون قديمة (أكثر من 14 يومًا) أو لا يملك البوت الصلاحية المطلوبة.');
        }
        return;
    }

    if (currentMsgText === '-مسح') {
        if (authorUser === 'mrxx0010' || authorUser === 'mr3b_9') {
            const currentChannel = message.channel; let isTeamChannel = false;
            for (let i = 1; i <= 16; i++) { if (currentChannel.name === `تيم・${i}` || currentChannel.name === `تيم-${i}` || currentChannel.name === `team-${i}` || currentChannel.name === `تيم_${i}`) { isTeamChannel = true; break; } }
            if (isTeamChannel) { try {
                    const fetchedMessages = await currentChannel.messages.fetch({ limit: 100 }); await currentChannel.bulkDelete(fetchedMessages, true);
                    const cleanNotice = await currentChannel.send({ content: '🧹 | **تم مسح وتطهير شات روم التيم بالكامل بنجاح!**' });
                    setTimeout(() => cleanNotice.delete().catch(() => {}), 5000); return;
                } catch (err) {} }
        }
    }
    if (currentMsgText === 'الفرق') {
        if (authorUser === 'mrxx0010' || authorUser === 'mr3b_9') {
            const currentChannel = message.channel; const parentCategory = currentChannel.parent;
            const isTargetChannel = currentChannel.name === 'شات・البطولة〡🎮';
            const isTargetCategory = parentCategory && (parentCategory.name.includes('البطولة') && (parentCategory.name.includes('🏆' ) || parentCategory.name.includes('كأس' || parentCategory.name.includes('كاس'))));
            let isTeamChannel = false; for (let i = 1; i <= 16; i++) { if (currentChannel.name === `تيم・${i}` || currentChannel.name === `تيم-${i}` || currentChannel.name === `team-${i}` || currentChannel.name === `تيم_${i}`) { isTeamChannel = true; break; } }
            if (isTargetChannel || isTargetCategory || isTeamChannel) {
                const db = getDatabase(); const sortedTeams = Object.values(db.teamsStats).sort((a, b) => b.points - a.points);
                const statsEmbed = new EmbedBuilder().setColor('#1abc9c').setTitle('🏆 لوحة وجدول صدارة إحصائيات كل فرق البطولة حياً الحين').setTimestamp();
                let leaderboardText = ""; sortedTeams.forEach((team, index) => { let medal = index === 0 ? '👑 🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤'; leaderboardText += `${medal} **المركز ${index + 1}:** \\\`${team.name}\\\` \n└ النزالات: \\\`${team.matches}\\\` | فوز: \\\`${team.wins}\\\` | خسارة: \\\`${team.losses}\\\` | **النقاط: \\\`${team.points}\\\`**\n\n`; });
                statsEmbed.setDescription(`📊 **جدول الترتيب العام التراكمي للأفرقة:** <@${message.author.id}>\n\n${leaderboardText || '*❌ لا توجد إحصائيات مسجلة للأفرقة حالياً بالبطولة.*'}`);
                return message.channel.send({ embeds: [statsEmbed] });
            }
        }
    }
    if (currentMsgText === 'تقييم') {
        const chName = message.channel.name.toLowerCase();
        if (chName.startsWith('ticket-')) {
            const blockListRegex = /(كرستال|كريستال|crystal|دعم|فني|support|رتبة|og|rank|role)/i;
            if (!blockListRegex.test(chName)) {
                const hasMediatorRole = message.member.roles.cache.some(role => { const rName = role.name.toLowerCase(); return rName.includes('وسيط') || rName.includes('الوسيط') || rName.includes('broker') || rName.includes('mediator'); });
                if (hasMediatorRole) {
                    const activeTicketKey = `active_${message.channel.id}`; const lastSentTime = tempRatings.get(activeTicketKey); const now = Date.now();
                    if (lastSentTime && (now - lastSentTime < 5000)) return;
                    tempRatings.set(activeTicketKey, now);
                    const ratingLobbyEmbed = new EmbedBuilder().setColor('#f1c40f').setTitle('⭐️ نظام تقييم عمليات الوسطاء المعتمد').setDescription(`مرحباً بك عزيزي العضو، يرجى الضغط على الزر الأخضر أدناه لوضع مراجعكتك للوسيط الحالي: <@${message.author.id}>`).setTimestamp();
                    await message.channel.send({ embeds: [ratingLobbyEmbed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("secure_vote_init_" + message.id).setLabel('تقييم الوسيط').setStyle(ButtonStyle.Success).setEmoji("1537439699386241064"))] });
                    tempRatings.set(`secure_data_${message.id}`, { takenBy: `<@${message.author.id}>`, ticketName: message.channel.name, brokerId: message.author.id, votedUsers: [], ticketChannelId: message.channel.id }); return;
                }
            }
        }
    }
    if (currentMsgText === 'ريست النقاط' && message.channel.name === 'تقييم・الوسطاء〡🏆') {
        if (!message.member.permissions.has('ManageGuild') && !message.member.permissions.has('Administrator')) return message.reply({ content: '❌ عذراً، هذا الأمر مخصص لإدارة السيرفر الكبرى!' });
        const db = getDatabase(); db.brokers = {}; fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 4));
        return message.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('⚡ تم تصفير قاعدة بيانات الوسطاء بنجاح!').setTimestamp()] });
    }

    if (lowerStr.startsWith('زيد ') || lowerStr.startsWith('نقص ') || lowerStr.startsWith('ريسيت ')) {
        if (message.channel.name === 'تقييم・الوسطاء〡🏆' && message.author.username === 'mrxx0010') {
            const msgArgs = currentMsgText.split(/ +/); const commandName = msgArgs.shift().toLowerCase();
            let targetMember = message.mentions.members.first();
            if (!targetMember && message.reference) { try { const repliedMessage = await message.channel.messages.fetch(message.reference.messageId); targetMember = await message.guild.members.fetch(repliedMessage.author.id); } catch (e) {} }
            if (commandName === 'ريسيت') {
                if (!targetMember) return message.reply({ content: '❌ الصيغة الصحيحة: `ريسيت @الوسيط`' });
                const db = getDatabase(); db.brokers[targetMember.id] = { totalOperations: 0, treatment: { excellent: 0, good: 0, bad: 0 }, speed: { excellent: 0, good: 0, bad: 0 }, history: [] };
                fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 4)); return message.reply({ content: `⚡ **تم التصفير بنجاح للوسيط:** ${targetMember}` });
            }
            const pointsNum = parseInt(msgArgs.shift() || "0"); if (isNaN(pointsNum) || pointsNum <= 0 || !targetMember) return message.reply({ content: `❌ الصيغة الصحيحة: \\\`${commandName} [الرقم] [@الوسيط]\\\`` });
            const db = getDatabase(); const brokerId = targetMember.id; if (!db.brokers[brokerId]) db.brokers[brokerId] = { totalOperations: 0, treatment: { excellent: 0, good: 0, bad: 0 }, speed: { excellent: 0, good: 0, bad: 0 }, history: [] };
            const successEmbed = new EmbedBuilder().setTimestamp();
            if (commandName === 'زيد') { db.brokers[brokerId].totalOperations += 1; db.brokers[brokerId].treatment.excellent += (pointsNum / 3); successEmbed.setColor('#2ecc71').setTitle('✅ تم إضافة النقاط بنجاح!').setDescription(`تمت زيادة نقاط الوسيط ${targetMember} بقيمة \\\`+${pointsNum}\\\` نقطة.`); }
            else if (commandName === 'نقص') { if (db.brokers[brokerId].totalOperations > 0) db.brokers[brokerId].totalOperations -= 1; db.brokers[brokerId].treatment.bad += (pointsNum / 2); successEmbed.setColor('#e74c3c').setTitle('📉 تم خصم النقاط بنجاح!').setDescription(`تم خصم نقاط الوسيط ${targetMember} بقيمة \\\`-${pointsNum}\\\` نقطة.`); }
            fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 4)); const successMsg = await message.reply({ embeds: [successEmbed] });
            setTimeout(() => { successMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 30000); return;
        }
    }

    if (message.channel.name === 'توقيت・〡timer⏲️') {
        let commandIn = ""; let durationStr = ""; if (lowerStr.startsWith('تايم ')) { commandIn = "تايم"; durationStr = rawText.slice(5).trim(); } else if (lowerStr.startsWith('مؤقت ')) { commandIn = "مؤقت"; durationStr = rawText.slice(5).trim(); } else if (lowerStr === 'stop') { commandIn = "stop"; } else { return; }
        const userTimerKey = `timer_${message.channel.id}_${message.author.id}`;
        if (commandIn === 'stop') {
            if (activeTimers.has(userTimerKey)) { const timerData = activeTimers.get(userTimerKey); clearTimeout(timerData.timeoutId); try { await timerData.replyMessage.delete().catch(() => {}); } catch(e) {} activeTimers.delete(userTimerKey); return message.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('🛑 تم إلغاء وإيقاف المؤقت الزمني').setDescription(`📢 تم إنهاء العداد بطلب من: <@${message.author.id}>`).setTimestamp()] }); }
            else { return message.reply({ content: '❌ لا يوجد لديك مؤقت نشط هنا لإيقافه!' }); }
        }
        if (commandIn === 'تايم' || commandIn === 'مؤقت') {
            if (!durationStr) return message.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('⚠️ خطأ في صيغة تشغيل المؤقت:').setDescription(`يرجى تحديد الوقت كالتالي: \\\`تايم 5m\\\``)] });
            const durationMs = parseDuration(durationStr); if (durationMs <= 0 || durationMs > 24 * 60 * 60 * 1000) return message.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ وقت غير صالح:').setDescription('يرجى إدخال وقت صحيح بين ثانية و24 ساعة.')] });
            if (activeTimers.has(userTimerKey)) clearTimeout(activeTimers.get(userTimerKey).timeoutId);
            const targetTime = Date.now() + durationMs; const endTimeSeconds = Math.floor(targetTime / 1000);
            const timerEmbed = new EmbedBuilder().setColor('#121212').setTitle('⏳ تم تنشيط العداد التنازلي الشامل').setDescription(`⏱️ **المدة المطلوب:** \\\`${durationStr}\\\``);
            const finalContent = `# ⏳ **الوقت الرقمي المستهدف المستقر:**\n# <t:${endTimeSeconds}:T>\n\n🏁 **ينتهي العداد التنازلي بالثواني حياً الحين:**\n# <t:\(\text{${endTimeSeconds}}\):R>`;
            const replyMessage = await message.reply({ content: finalContent, embeds: [timerEmbed] });
            const timeoutId = setTimeout(async () => { try { activeTimers.delete(userTimerKey); await replyMessage.edit({ content: `# 🏁 **00:00:00**\n# **اكتمل المؤقت بنجاح الكلي!**`, embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('🏁 انتهى الوقت للمؤقت!').setDescription(`⏱️ **المدة:** \\\`${durationStr}\\\``)] }).catch(() => {}); return message.channel.send({ content: `⏰ | انتهى الوقت الكلي للمؤقت الخاص بك بنجاح يا غالي! <@${message.author.id}>` }); } catch (e) {} }, durationMs);
            activeTimers.set(userTimerKey, { timeoutId, replyMessage });
        }
    }
});
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const commandName = interaction.commandName;

    if (commandName === 'الافرقه' || commandName === 'احصائيات' || commandName === 'فوز' || commandName === 'مواجهة') {
        if (!interaction.inGuild() || interaction.channel?.name !== 'شات・البطولة〡🎮') {
            return interaction.reply({ content: '❌ **عذراً يا غالي، هذا الأمر من خيارات البطولة الكبرى ولا يمكن استخدامه إلا حصرياً داخل روم <#شات・البطولة〡🎮> فقط حماية للسيرفر كلياً!**', ephemeral: true });
        }
    }

    if (commandName === 'فوز') {
        if (!interaction.member.permissions.has('ManageRoles') && !interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ عذراً يا غالي، هذا الأمر مخصص فقط لمنظمي البطولة وإدارة السيرفر العليا!', ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: false }).catch(() => {}); const newChampion = interaction.options.getMember('البطل'); const championRole = interaction.guild.roles.cache.find(role => role.name === 'WINNER');
        if (!championRole) return interaction.editReply({ content: '❌ خطأ حاسم: لم يتم العثور على رتبة في السيرفر تحمل اسم `WINNER` بالضبط!' });
        try {
            const allMembers = await interaction.guild.members.fetch();
            for (const [id, member] of allMembers) { if (member.roles.cache.has(championRole.id) && id !== newChampion.id) { await member.roles.remove(championRole.id).catch(() => {}); } }
            await newChampion.roles.add(championRole.id); const allChannels = await interaction.guild.channels.fetch();
            for (let i = 1; i <= 16; i++) { const targetChannel = allChannels.find(c => c.isTextBased() && (c.name === `تيم・${i}` || c.name === `تيم-${i}` || c.name === `team-${i}` || c.name === `تيم_${i}`)); if (targetChannel) { await targetChannel.permissionOverwrites.set([{ id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]); } }
            const db = getDatabase(); db.teamsStats = {}; fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 4));
            const crownEmbed = new EmbedBuilder().setColor('#f1c40f').setTitle('👑 زفة وتتويج بطل السيرفر المعتمد والجديد للبطولة').setDescription(`🏆 **تحت رعاية إدارة السيرفر والمنظمين، نعلن رسمياً الحين انتهاء موسم البطولة كلياً وتتويج المقاتل الخارق بطلاً رسمياً:**\n\n# 🎖️ بطل السيرفر الحالي: \s${newChampion} 🎖️\n\n🔐 **تم تقليدك رتبة <@&${championRole.id}> تلقائياً إثباتاً للجدارة! ألف مبروك وعقبال باقي المواسم القادمة!**`).setTimestamp().setThumbnail(newChampion.user.displayAvatarURL({ dynamic: true }));
            return interaction.editReply({ content: `🎉 | باركوا للملك الجديد يا شباب! ${newChampion}`, embeds: [crownEmbed] });
        } catch (err) { return interaction.editReply({ content: '❌ فشل التتويج، تأكد من صلاحيات رتبة البوت!' }); }
    }
    if (commandName === 'المتصدرون') {
        if (!interaction.inGuild() || interaction.channel?.name !== 'تقييم・الوسطاء〡🏆') return interaction.reply({ content: '❌ عذراً، هذا الأمر مخصص للاستخدام داخل روم التقييمات المعتمد!', ephemeral: true });
        await interaction.deferReply({ ephemeral: false }); const db = getDatabase(); const selectOptions = []; const finalBrokersList = new Map();
        try {
            const allMembers = await interaction.guild.members.fetch();
            allMembers.forEach(member => { const hasMediatorRole = member.roles.cache.some(role => { const rName = role.name.toLowerCase(); return rName.includes('وسيط') || rName.includes('الوسيط') || rName.includes('broker') || rName.includes('mediator'); }); if (hasMediatorRole) finalBrokersList.set(member.id, { id: member.id, score: 0, total: 0, name: member.displayName || member.user.username }); });
            Object.keys(db.brokers).forEach(id => {
                const b = db.brokers[id]; const calculatedScore = Math.round(((b?.treatment?.excellent || 0) + (b?.speed?.excellent || 0)) * 3 + ((b?.treatment?.good || 0) + (b?.speed?.good || 0)) * 1 - ((b?.treatment?.bad || 0) + (b?.speed?.bad || 0)) * 2); const exStr = String(id);
                if (finalBrokersList.has(exStr)) { const existing = finalBrokersList.get(exStr); existing.score = calculatedScore; existing.total = Math.round(b?.totalOperations || 0); } 
                else { finalBrokersList.set(exStr, { id: exStr, score: calculatedScore, total: Math.round(b?.totalOperations || 0), name: "عضو مغادر" }); }
            });
            const sortedBrokers = Array.from(finalBrokersList.values()).sort((a, b) => b.score - a.score); if (sortedBrokers.length === 0) return interaction.editReply({ content: '❌ لم يتم العثور على أي وسطاء لبناء اللوحة!' });
            const leaderboardEmbed = new EmbedBuilder().setColor('#f1c40f').setTitle('🏆 لوحة الترتيب الشامل لجميع وسطاء السيرفر').setTimestamp();
            let leaderboardText = ""; for (let i = 0; i < sortedBrokers.length; i++) { const item = sortedBrokers[i]; let medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '👤'; leaderboardText += `${medal} **المركز ${i+1}:** <@${item.id}> \n └ العمليات: \\\`${item.total}\\\` | النقاط الكلية: \\\`${item.score}\\\`\n\n`; selectOptions.push({ label: item.name.slice(0, 25), description: `المركز ${i+1} | النقاط: ${item.score}`, value: `view_broker_` + item.id }); }
            const rowMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('leaderboard_select_broker').setPlaceholder('🎯 اضغط هنا واختـر الوسيط لعرض كافة تقييماته...').addOptions(selectOptions.slice(0, 25)));
            leaderboardEmbed.addFields({ name: '📊 لستة الوسطاء مرتبة بالكامل:', value: leaderboardText || 'لا يوجد وسطاء مسجلين' }); return interaction.editReply({ embeds: [leaderboardEmbed], components: [rowMenu] });
        } catch (e) { return interaction.editReply({ content: '❌ حدث خطأ داخلي كلي.' }); }
    }

    if (commandName === 'مواجهة') {
        await interaction.deferReply({ ephemeral: false }); const team1Input = interaction.options.getString('الفريق_الأول') || ""; const team2Input = interaction.options.getString('الفريق_الثاني') || "";
        const playerIds = []; const t1Matches = team1Input.match(/<@!?\d+>/g) || []; const t2Matches = team2Input.match(/<@!?\d+>/g) || [];
        t1Matches.forEach(m => { const id = m.replace(/[<@!>]/g, ''); playerIds.push(id); }); t2Matches.forEach(m => { const id = m.replace(/[<@!>]/g, ''); playerIds.push(id); });
        if (playerIds.length === 0) return interaction.editReply({ content: '❌ خطأ: يرجى منشن لاعبي الفرق بشكل صحيح!' });
        const matchId = "match_" + interaction.id; const endTimeSeconds = Math.floor((Date.now() + 10 * 60 * 1000) / 1000);
        tournamentMatches.set(matchId, { allPlayers: playerIds, readyPlayers: [], expired: false, team1Text: team1Input, team2Text: team2Input });
        const battleEmbed = new EmbedBuilder().setColor('#e74c3c').setTitle('⚔️ لوحة وجدول مواجهات البطولة للفرق').setDescription(`🔵 **الفريق الأول ومقاتليه:**\n${team1Input}\n\n🔴 **الفريق الثاني ومقاتليه:**\n${team2Input}\n\n⏳ **تأكيد الحضور (10 دقائق):**\n# <t:${endTimeSeconds}:R>\n\n🎮 **قائمة اللاعبين المستعدين حياً (0):**\n*❌ لا يوجد أحد مستعد بعد، اضغط على الزر أدناه!*`).setTimestamp();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("battle_ready_" + matchId).setLabel('أنا جاهز ومستعد 🎮').setStyle(ButtonStyle.Success));
        const tournamentRole = interaction.guild.roles.cache.find(role => role.name.includes('بطولة') || role.name.includes('البطولة'));
        const pingContent = tournamentRole ? `📢 | نداء لـ <@&${tournamentRole.id}> انطلقت مواجهة جديدة! تأكيد الحضور بالزر:` : `📢 | نداء لـ **رتبة البطولة** انطلقت مواجهة جديدة الحين!`;
        await interaction.editReply({ content: pingContent, embeds: [battleEmbed], components: [row] });
        setTimeout(async () => { const currentMatch = tournamentMatches.get(matchId); if (currentMatch) { currentMatch.expired = true; tournamentMatches.set(matchId, currentMatch); await interaction.editReply({ content: '🛑 انتهى وقت التجهيز الكلي للنزال!', components: [] }).catch(() => {}); } }, 10 * 60 * 1000); return;
    }
    if (commandName === 'الافرقه') {
        await interaction.deferReply({ ephemeral: false }); let updatedCount = 0; let reportText = ""; const allChannels = await interaction.guild.channels.fetch();
        for (let i = 1; i <= 16; i++) {
            const fieldText = interaction.options.getString(`تيم_${i}`); if (!fieldText) continue;
            const uIds = []; const matchesU = fieldText.match(/<@!?\d+>/g) || []; matchesU.forEach(m => { const id = m.replace(/[<@!>]/g, ''); if(!uIds.includes(id)) uIds.push(id); });
            if (uIds.length > 0) {
                const targetChannel = allChannels.find(c => c.isTextBased() && (c.name === `تيم・${i}` || c.name === `تيم-${i}` || c.name === `team-${i}` || c.name === `تيم_${i}`));
                if (targetChannel) { try {
                        await targetChannel.permissionOverwrites.set([{ id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]);
                        for (const id of uIds) { await targetChannel.permissionOverwrites.edit(id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }); }
                        updatedCount++; reportText += `✅ **تيم ${i}** ➜ تم ربطه بـ الروم المسبق <#${targetChannel.id}> 📝\n └ الأبطال المشاركين: ${uIds.map(id => `<@${id}>`).join(', ')}\n\n`;
                    } catch (err) { reportText += `❌ **فشل تعديل تيم ${i}:** بسبب رتبة البوت.\n\n`; }
                } else { reportText += `⚠️ **تيم ${i}:** لم يتم العثور على روم نصي جاهز مسبقاً باسم \\\`تيم・${i}\\\` في قنوات السيرفر!\n\n`; }
            }
        }
        if (updatedCount === 0) return interaction.editReply({ content: '❌ خطأ حاسم: لم يتم العثور على أي رومات نصية مطابقة للأسماء الجاهزة بسيرفرك!' });
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('👑 جدول إعلان توزيع الأفرقة الرسمي المعتمد للبطولة').setDescription(`📢 **إلى كل أعضاء السيرفر والأبطال المشاركين، تم فرز وتحديث صلاحيات المجموعات حياً الحين:**\n\n${reportText}`).setTimestamp()] });
    }

    if (commandName === 'احصائيات') {
        await interaction.deferReply({ ephemeral: false }); const winner = interaction.options.getString('الفريق_الفائز'); const loser = interaction.options.getString('الفريق_الخاسر'); const scoreResult = interaction.options.getString('النتيجة');
        updateTeamMatchStats(winner, loser); const db = getDatabase(); const sortedTeams = Object.values(db.teamsStats).sort((a, b) => b.points - a.points);
        const statsEmbed = new EmbedBuilder().setColor('#1abc9c').setTitle('🏆 لوحة وجدول صدارة إحصائيات كل فرق البطولة').setDescription(`📢 **تم تسجيل نتيجة الجولة الجديدة بنجاح وتحديث نقاط الصدارة للكل حياً الحين:**\n\n🔥 **مباراة اليوم:** \\\`${winner}\\\` 🆚 \\\`${loser}\\\` ( ${scoreResult} )\n👑 **نتيجة الجولة:** فوز ساحق لـ **${winner}** 🏁\n\n📊 **جدول التفتيش والترتيب التراكمي للفرق الحين:**`).setTimestamp();
        let leaderboardText = ""; sortedTeams.forEach((team, index) => { let medal = index === 0 ? '👑 🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤'; leaderboardText += `${medal} **المركز ${index + 1}:** \\\`${team.name}\\\` \n└ النزالات: \\\`${team.matches}\\\` | فوز: \\\`${team.wins}\\\` | خسارة: \\\`${team.losses}\\\` | **النقاط: \\\`${team.points}\\\`**\n\n`; });
        statsEmbed.addFields({ name: '🏆 لستة ترتيب صدارة نقاط الأفرقة المحدثة الحين:', value: leaderboardText || '*❌ لا توجد إحصائيات مسجلة للأفرقة حالياً بالبطولة.*' }); return interaction.editReply({ embeds: [statsEmbed] });
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;
    const customId = interaction.customId;
    if (interaction.isStringSelectMenu() && customId === 'leaderboard_select_broker') { try { await interaction.deferReply({ ephemeral: true }).catch(() => {}); const selectedValue = String(interaction.values.slice(0, 1)); const brokerId = selectedValue.replace('view_broker_', ''); const db = getDatabase(); const bData = db.brokers[brokerId] || { totalOperations: 0, treatment: { excellent: 0, good: 0, bad: 0 }, speed: { excellent: 0, good: 0, bad: 0 }, history: [] }; return interaction.editReply({ embeds: [createBrokerEmbed(bData, brokerId, interaction.guild.iconURL())] }); } catch (e) {} }
    if (customId && customId.startsWith('battle_ready_')) { const matchId = customId.replace('battle_ready_', ''); const match = tournamentMatches.get(matchId); if (!match || match.expired) return interaction.reply({ content: '❌ ended الجلسة!', ephemeral: true }); if (!match.allPlayers.includes(interaction.user.id)) return interaction.reply({ content: '❌ أنت لست مشاركاً في هذه المواجهة!', ephemeral: true }); if (match.readyPlayers.includes(interaction.user.id)) return interaction.reply({ content: '⚠️ مسجل مسبقاً جاهز!', ephemeral: true }); match.readyPlayers.push(interaction.user.id); tournamentMatches.set(matchId, match); let listReady = ""; match.readyPlayers.forEach(id => { listReady += `🔹 <@${id}> (جاهز ✅)\n`; }); const updatedEmbed = EmbedBuilder.from(interaction.message.embeds); updatedEmbed.setDescription(`🔵 **الفريق الأول ومقاتليه:**\n${match.team1Text}\n\n🔴 **الفريق الثاني ومقاتليه:**\n${match.team2Text}\n\n🎮 **قائمة اللاعبين المستعدين (${match.readyPlayers.length}):**\n${listReady}`); return interaction.update({ embeds: [updatedEmbed] }); }
    if (customId && customId.startsWith('secure_vote_init_')) { try { const idKey = customId.replace('secure_vote_init_', ''); const tData = tempRatings.get(`secure_data_${idKey}`); if (!tData || tData.votedUsers.includes(interaction.user.id)) return interaction.reply({ content: '❌ غير متاح!', ephemeral: true }); if (interaction.user.id === tData.brokerId) return interaction.reply({ content: '❌ لا يمكنك تقييم نفسك غالي!', ephemeral: true }); return interaction.reply({ content: `🎫 **خطوة 1 من 2:** حدد مستوى أسلوب وتعامل الوسيط:`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("secstep_excellent_" + idKey).setLabel('ممتاز 🟢').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId("secstep_good_" + idKey).setLabel('جيد 🟡').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("secstep_bad_" + idKey).setLabel('سيئ 🔴').setStyle(ButtonStyle.Danger))], ephemeral: true }); } catch (e) {} }
    if (customId && customId.startsWith('secstep_')) { try { const cleanText = customId.replace('secstep_', ''); const firstUnderscore = cleanText.indexOf('_'); const choice = cleanText.slice(0, firstUnderscore); const idKey = cleanText.slice(firstUnderscore + 1); return interaction.update({ content: `⚡ **خطوة 2 من 2:** حدد مستوى سرعة تسليم الوسيط للطلب:`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("secfinal_" + choice + "_excellent_" + idKey).setLabel('ممتاز 🟢').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId("secfinal_" + choice + "_good_" + idKey).setLabel('جيد 🟡').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("secfinal_" + choice + "_bad_" + idKey).setLabel('سيئ 🔴').setStyle(ButtonStyle.Danger))] }); } catch (e) {} }
    if (customId && customId.startsWith('secfinal_')) { try { const cleanFinal = customId.replace('secfinal_', ''); const firstUnder = cleanFinal.indexOf('_'); const treatmentResult = cleanFinal.slice(0, firstUnder); const restText = cleanFinal.slice(firstUnder + 1); const secondUnder = restText.indexOf('_'); const speedResult = restText.slice(0, secondUnder); const idKey = restText.substring(secondUnder + 1); const tData = tempRatings.get(`secure_data_${idKey}`); if (!tData || tData.votedUsers.includes(interaction.user.id)) return; let treatArabic = treatmentResult === 'excellent' ? 'ممتاز' : treatmentResult === 'good' ? 'جيد' : 'سيئ'; let speedArabic = speedResult === 'excellent' ? 'ممتاز' : speedResult === 'good' ? 'جيد' : 'سيئ'; const cleanBrokerId = tData.takenBy.replace(/\\D/g, ''); saveRatingToDB(cleanBrokerId, treatArabic, speedArabic, `<@${interaction.user.id}>`, `${tData.ticketName}`); tData.votedUsers.push(interaction.user.id); tempRatings.set(`secure_data_${idKey}`, tData); tempRatings.delete(`active_${tData.ticketChannelId}`); try { await interaction.channel.send({ content: `📢 | 🎫 العضو <@${interaction.user.id}> قام بتقديم تقييمه للوسيط بنجاح! ✅` }); } catch (e) {} const publicEvalChannel = interaction.guild.channels.cache.find(c => c.name.includes('تقييم') && c.name.includes('الوسطاء')); if (publicEvalChannel) { await publicEvalChannel.send({ embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('🏆 تم تسجيل ونشر تقييم جديد للعملية الناجحة').addFields({ name: '👑 الوسيط المسؤول:', value: tData.takenBy, inline: true }, { name: '👤 العضو صاحب التقييم:', value: `<@${interaction.user.id}>`, inline: true }, { name: '💬 تقييم التعامل:', value: `\\\`${treatArabic}\\\``, inline: true }, { name: '⚡ تقييم السرعة:', value: `\\\`${speedArabic}\\\``, inline: true }).setTimestamp()] }); } return interaction.update({ content: '✅ **بيض الله وجهك!** تم إرسال مراجعكتك بنجاح!', components: [] }); } catch (error) {} }
});

client.login(config.token);
