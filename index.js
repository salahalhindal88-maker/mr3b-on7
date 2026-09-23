const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Partials, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.User]
});

const tempRatings = new Map();
const activeTimers = new Map(); 
const tournamentMatches = new Map();
const DB_PATH = './ratings_database.json';
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
function saveRatingToDB(brokerId, treatment, speed, ticketOwner = "عضو غير محدد", ticketReason = "لا يوجد سبب") {
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
            { name: '💬 تقييمات التعامل:', value: `👑 ممتاز: \`${treatExcellent}\` (${treatExPercent}%)\n🟡 جيد: \`${treatGood}\` \n🔴 سيئ: \`${treatBad}\``, inline: true },
            { name: '⚡ تقييمات السرعة:', value: `👑 ممتاز: \`${speedExcellent}\` (${speedExPercent}%)\n🟡 جيد: \`${speedGood}\` \n🔴 سيئ: \`${speedBad}\``, inline: true }
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

const teamsSlashCommand = new SlashCommandBuilder()
    .setName('الافرقه')
    .setDescription('🛠️ تفكيك وتوزيع صلاحيات رومات التيمات المفتوحة مسبقاً ونشر جدول مواجهات الفرق للكل.')
    .addStringOption(opt => opt.setName('تيم_1').setDescription('منشن لاعبي تيم 1 بمسافات (مثال: @لاعب1 @لاعب2)').setRequired(true));

for (let i = 2; i <= 16; i++) { teamsSlashCommand.addStringOption(opt => opt.setName(`تيم_${i}`).setDescription(`منشن لاعبي تيم ${i} بمسافات (اختياري)`).setRequired(false)); }
client.once('ready', async () => {
    console.log("==========================================");
    console.log("ALL SYSTEMS ONLINE - RUNNING STABLE ON RAILWAY CLOUD");
    console.log("==========================================");
    try {
        const rest = new REST({ version: '10' }).setToken(config.token);
        const commands = [
            new SlashCommandBuilder().setName('المتصدرون').setDescription('🏆 عرض قائمة جميع وسطاء السيرفر مرتبين من الأعلى تقييماً إلى الأقل.'),
            new SlashCommandBuilder().setName('مواجهة').setDescription('⚔️ إنشاء جدول مواجهة وبطاقة نزال فخمة للفرق بالبطولة.')
                .addStringOption(option => option.setName('الفريق_الأول').setDescription('منشن لاعبي الفريق الأول بمسافات').setRequired(true))
                .addStringOption(option => option.setName('الفريق_الثاني').setDescription('منشن لاعبي الفريق الثاني بمسافات').setRequired(true)),
            new SlashCommandBuilder().setName('فوز').setDescription('👑 إعلان وتتويج بطل السيرفر الجديد ونقل رتبة WINNER وتصفير الموسم.')
                .addUserOption(option => option.setName('البطل').setDescription('منشن اللاعب الفائز بالبطولة لتتويجه باللقب الحين').setRequired(true)),
            new SlashCommandBuilder().setName('احصائيات').setDescription('📊 تسجيل نتيجة نزالات جولات البطولة وعرض جدول ترتيب إحصائيات كل الفرق.')
                .addStringOption(option => option.setName('الفريق_الفائز').setDescription('اكتب اسم الفريق الفائز بالنزال').setRequired(true))
                .addStringOption(option => option.setName('الفريق_الخاسر').setDescription('اكتب اسم الفريق الخاسر بالنزال').setRequired(true))
                .addStringOption(option => option.setName('النتيجة').setDescription('اكتب نتيجة الجولة بالأرقام (مثال: 2 - 0)').setRequired(true)),
            teamsSlashCommand
        ].map(cmd => cmd.toJSON());
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (error) {}
});
client.on('messageCreate', async (message) => {
    if (message.author.id === client.user.id) return;
    const rawText = message.content.trim(); const currentMsgText = rawText; const lowerStr = rawText.toLowerCase();
    const authorUser = message.author.username;

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
                let leaderboardText = ""; sortedTeams.forEach((team, index) => { let medal = index === 0 ? '👑 🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤'; leaderboardText += `${medal} **المركز ${index + 1}:** \`${team.name}\` \n└ النزالات: \`${team.matches}\` | فوز: \`${team.wins}\` | خسارة: \`${team.losses}\` | **النقاط: \`${team.points}\`**\n\n`; });
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
            const pointsNum = parseInt(msgArgs.shift() || "0"); if (isNaN(pointsNum) || pointsNum <= 0 || !targetMember) return message.reply({ content: `❌ الصيغة الصحيحة: \`${commandName} [الرقم] [@الوسيط]\`` });
            const db = getDatabase(); const brokerId = targetMember.id; if (!db.brokers[brokerId]) db.brokers[brokerId] = { totalOperations: 0, treatment: { excellent: 0, good: 0, bad: 0 }, speed: { excellent: 0, good: 0, bad: 0 }, history: [] };
            const successEmbed = new EmbedBuilder().setTimestamp();
            if (commandName === 'زيد') { db.brokers[brokerId].totalOperations += 1; db.brokers[brokerId].treatment.excellent += (pointsNum / 3); successEmbed.setColor('#2ecc71').setTitle('✅ تم إضافة النقاط بنجاح!').setDescription(`تمت زيادة نقاط الوسيط ${targetMember} بقيمة \`+${pointsNum}\` نقطة.`); }
            else if (commandName === 'نقص') { if (db.brokers[brokerId].totalOperations > 0) db.brokers[brokerId].totalOperations -= 1; db.brokers[brokerId].treatment.bad += (pointsNum / 2); successEmbed.setColor('#e74c3c').setTitle('📉 تم خصم النقاط بنجاح!').setDescription(`تم خصم نقاط الوسيط ${targetMember} بقيمة \`-${pointsNum}\` نقطة.`); }
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
            if (!durationStr) return message.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('⚠️ خطأ في صيغة تشغيل المؤقت:').setDescription(`يرجى تحديد الوقت كالتالي: \`تايم 5m\``)] });
            const durationMs = parseDuration(durationStr); if (durationMs <= 0 || durationMs > 24 * 60 * 60 * 1000) return message.reply({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('❌ وقت غير صالح:').setDescription('يرجى إدخال وقت صحيح بين ثانية و24 ساعة.')] });
            if (activeTimers.has(userTimerKey)) clearTimeout(activeTimers.get(userTimerKey).timeoutId);
            const targetTime = Date.now() + durationMs; const endTimeSeconds = Math.floor(targetTime / 1000);
            const timerEmbed = new EmbedBuilder().setColor('#121212').setTitle('⏳ تم تنشيط العداد التنازلي الشامل').setDescription(`⏱️ **المدة المطلوب:** \`${durationStr}\``);
            const finalContent = `# ⏳ **الوقت الرقمي المستهدف المستقر:**\n# <t:${endTimeSeconds}:T>\n\n🏁 **ينتهي العداد التنازلي بالثواني حياً الحين:**\n# <t:${endTimeSeconds}:R>`;
            const replyMessage = await message.reply({ content: finalContent, embeds: [timerEmbed] });
            const timeoutId = setTimeout(async () => { try { activeTimers.delete(userTimerKey); await replyMessage.edit({ content: `# 🏁 **00:00:00**\n# **اكتمل المؤقت بنجاح الكلي!**`, embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('🏁 انتهى الوقت للمؤقت!').setDescription(`⏱️ **المدة:** \`${durationStr}\``)] }).catch(() => {}); return message.channel.send({ content: `⏰ | انتهى الوقت الكلي للمؤقت الخاص بك بنجاح يا غالي! <@${message.author.id}>` }); } catch (e) {} }, durationMs);
            activeTimers.set(userTimerKey, { timeoutId, replyMessage });
        }
    }
});
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const commandName = interaction.commandName;

    // 🔒 [القفل الجغرافي الصارم المطور]: قفل خيارات البطولة كلياً داخل روم شات البطولة لمنع التشتيت
    if (commandName === 'الافرقه' || commandName === 'احصائيات' || commandName === 'فوز' || commandName === 'مواجهة') {
        if (interaction.channel.name !== 'شات・البطولة〡🎮') {
            return interaction.reply({ content: '❌ **عذراً يا غالي، هذا الأمر من خيارات البطولة الكبرى ولا يمكن استخدامه إلا حصرياً داخل روم <#شات・البطولة〡🎮> لحماية خصوصية السيرفر كلياً!**', ephemeral: true });
        }
    }
    if (commandName === 'فوز') {
        if (!interaction.member.permissions.has('ManageRoles') && !interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ عذراً يا غالي، هذا الأمر مخصص فقط لمنظمي البطولة وإدارة السيرفر العليا!', ephemeral: true });
        }
        
        // ⚡ [التأكيد التفاعلي اللحظي الفوري لتنظيف الـ القلتش الأحمر]:
        await interaction.deferReply({ ephemeral: false }).catch(() => {}); 
        const newChampion = interaction.options.getMember('البطل'); const championRole = interaction.guild.roles.cache.find(role => role.name === 'WINNER');
        if (!championRole) return interaction.editReply({ content: '❌ خطأ حاسم: لم يتم العثور على رتبة في السيرفر تحمل اسم `WINNER` بالضبط!' });
        try {
            const allMembers = await interaction.guild.members.fetch();
            for (const [id, member] of allMembers) { if (member.roles.cache.has(championRole.id) && id !== newChampion.id) { await member.roles.remove(championRole.id).catch(() => {}); } }
            await newChampion.roles.add(championRole.id);
            const allChannels = await interaction.guild.channels.fetch();
            for (let i = 1; i <= 16; i++) { const targetChannel = allChannels.find(c => c.isTextBased() && (c.name === `تيم・${i}` || c.name === `تيم-${i}` || c.name === `team-${i}` || c.name === `تيم_${i}`)); if (targetChannel) { await targetChannel.permissionOverwrites.set([{ id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]).catch(() => {}); } }
            
            const db = getDatabase(); db.teamsStats = {}; fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 4));

            const crownEmbed = new EmbedBuilder().setColor('#f1c40f').setTitle('👑 زفة وتتويج بطل السيرفر المعتمد والجديد للبطولة')
                .setDescription(`🏆 **تحت رعاية إدارة السيرفر والمنظمين، نعلن رسمياً الحين انتهاء موسم البطولة كلياً وتتويج المقاتل الخارق بطلاً رسمياً:**\n\n# 🎖️ بطل السيرفر الحالي: ${newChampion} 🎖️\n\n🔐 **تم تقليدك رتبة <@&${championRole.id}> تلقائياً إثباتاً للجدارة! ألف مبروك كلياً وعقبال باقي الأبطال المواسم القادمة!**`)
                .setTimestamp().setThumbnail(newChampion.user.displayAvatarURL({ dynamic: true }));
            return interaction.editReply({ content: `🎉 | باركوا للملك الجديد يا شباب! ${newChampion}`, embeds: [crownEmbed] });
        } catch (err) { return interaction.editReply({ content: '❌ فشل التتويج، تأكد من صلاحيات رتبة البوت!' }); }
    }
    if (commandName === 'المتصدرون') {
        if (interaction.channel.name !== 'تقييم・الوسطاء〡🏆') return interaction.reply({ content: '❌ عذراً، هذا الأمر مخصص للاستخدام داخل روم التقييمات المعتمد!', ephemeral: true });
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
            const leaderboardEmbed = new EmbedBuilder().setColor('#f1c40f').setTitle('🏆 لوحة الترتيب الشامل لجميع وسطاء السيرفر').setDescription('لوحة صدارة نقاط وسطاء السيرفر مرتبة تنازلياً:').setTimestamp();
            let leaderboardText = ""; for (let i = 0; i < sortedBrokers.length; i++) { const item = sortedBrokers[i]; let medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '👤'; leaderboardText += `${medal} **المركز ${i+1}:** <@${item.id}> \n └ العمليات: \`${item.total}\` | النقاط الكلية: \`${item.score}\`\n\n`; selectOptions.push({ label: item.name.slice(0, 25), description: `المركز ${i+1} | النقاط: ${item.score}`, value: `view_broker_` + item.id }); }
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
                } else { reportText += `⚠️ **تيم ${i}:** لم يتم العثور على روم نصي جاهز مسبقاً باسم \`تيم・${i}\` في قنوات السيرفر!\n\n`; }
            }
        }
        if (updatedCount === 0) return interaction.editReply({ content: '❌ خطأ حاسم: لم يتم العثور على أي رومات نصية مطابقة للأسماء الجاهزة بسيرفرك!' });
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('👑 جدول إعلان توزيع الأفرقة الرسمي المعتمد للبطولة').setDescription(`📢 **إلى كل أعضاء السيرفر والأبطال المشاركين، تم فرز وتحديث صلاحيات المجموعات حياً الحين:**\n\n${reportText}`).setTimestamp()] });
    }

    if (commandName === 'احصائيات') {
        await interaction.deferReply({ ephemeral: false }); const winner = interaction.options.getString('الفريق_الفائز'); const loser = interaction.options.getString('الفريق_الخاسر'); const scoreResult = interaction.options.getString('النتيجة');
        updateTeamMatchStats(winner, loser); const db = getDatabase(); const sortedTeams = Object.values(db.teamsStats).sort((a, b) => b.points - a.points);
        const statsEmbed = new EmbedBuilder().setColor('#1abc9c').setTitle('🏆 لوحة وجدول صدارة إحصائيات كل فرق البطولة').setDescription(`📢 **تم تسجيل نتيجة الجولة الجديدة بنجاح وتحديث نقاط الصدارة للكل حياً الحين:**\n\n🔥 **مباراة اليوم:** \`${winner}\`  ( ${scoreResult} )  \`${loser}\`\n👑 **نتيجة الجولة:** فوز ساحق لـ **${winner}** 🏁\n\n📊 **جدول التفتيش والترتيب التراكمي للفرق الحين:**`).setTimestamp();
        let leaderboardText = ""; sortedTeams.forEach((team, index) => { let medal = index === 0 ? '👑 🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤'; leaderboardText += `${medal} **المركز ${index + 1}:** \`${team.name}\` \n└ النزالات: \`${team.matches}\` | فوز: \`${team.wins}\` | خسارة: \`${team.losses}\` | **النقاط: \`${team.points}\`**\n\n`; });
        statsEmbed.addFields({ name: '🏆 لستة ترتيب صدارة نقاط الأفرقة المحدثة الحين:', value: leaderboardText || '*❌ لا توجد إحصائيات مسجلة للأفرقة حالياً بالبطولة.*' }); return interaction.editReply({ embeds: [statsEmbed] });
    }
});

client.login(process.env.TOKEN);
