const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Partials, StringSelectMenuBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
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
const DB_PATH = './ratings_database.json';

function getDatabase() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ brokers: {} }, null, 4));
    }
    try { 
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data || '{"brokers":{}}'); 
    } catch (e) { 
        return { brokers: {} }; 
    }
}

function saveRatingToDB(brokerId, treatment, speed, ticketOwner = "عضو غير محدد", ticketReason = "لا يوجد سبب") {
    const db = getDatabase();
    if (!db.brokers[brokerId]) {
        db.brokers[brokerId] = { 
            totalOperations: 0, 
            treatment: { excellent: 0, good: 0, bad: 0 }, 
            speed: { excellent: 0, good: 0, bad: 0 },
            history: [] 
        };
    }
    const broker = db.brokers[brokerId]; 
    if (!broker.history) broker.history = []; 
    
    broker.totalOperations += 1;
    
    if (treatment === 'ممتاز') broker.treatment.excellent += 1;
    if (treatment === 'جيد') broker.treatment.good += 1;
    if (treatment === 'سيئ') broker.treatment.bad += 1;
    
    if (speed === 'ممتاز') broker.speed.excellent += 1;
    if (speed === 'جيد') broker.speed.good += 1;
    if (speed === 'سيئ') broker.speed.bad += 1;
    
    const timestampStr = new Date().toLocaleString('ar-EG', { timeZone: 'Asia/Riyadh' });
    const operationLog = {
        owner: ticketOwner,
        reason: ticketReason,
        time: timestampStr,
        rate: `💬 ${treatment} | ⚡ ${speed}`
    };
    
    broker.history.unshift(operationLog);
    if (broker.history.length > 3) {
        broker.history = broker.history.slice(0, 3);
    }
    
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
    
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`📊 السجل المهني وإحصائيات التقييم الكلي للوسيط`)
        .setDescription(`ملف البيانات والدرجات الشاملة المستخرجة للوسيط المستهدف: <@${brokerId}>`)
        .addFields(
            { name: '💼 إجمالي العمليات الناجحة:', value: `\`${total}\` عملية منفذة ومقيمة`, inline: false },
            { name: '💬 تقييمات أسلوب التعامل:', value: `👑 ممتاز: \`${treatExcellent}\` (${treatExPercent}%)\n🟡 جيد: \`${treatGood}\` \n🔴 سيئ: \`${treatBad}\``, inline: true },
            { name: '⚡ تقييمات سرعة تسليم وإنجاز الصفقات:', value: `👑 ممتاز: \`${speedExcellent}\` (${speedExPercent}%)\n🟡 جيد: \`${speedGood}\` \n🔴 سيئ: \`${speedBad}\``, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'لوحة فحص بيانات الوسطاء المعتمدة', iconURL: guildIcon || undefined });

    let historyText = "";
    if (bData && bData.history && bData.history.length > 0) {
        bData.history.forEach((op, index) => {
            historyText += `🔹 **العملية ${index + 1}:**\n` +
                           `└ صاحب التقييم: ${op.owner}\n` +
                           `└ مسمى الغرفة: \`${op.reason}\`\n` +
                           `└ التقييم: ${op.rate}\n` +
                           `└ الوقت: \`${op.time}\`\n\n`;
        });
    } else {
        historyText = "*❌ لا يوجد سجل عمليات مقيمة ومحفوظة لهذا الوسيط حالياً.*";
    }

    embed.addFields({ name: '📝 سجل آخر 3 عمليات منفذة ومقيمة للوسيط:', value: historyText, inline: false });
    return embed;
}

function parseDuration(timeStr) {
    const regex = /(\d+)\s*(h|m|s|ساعة|دقيقة|ثانية|د|ث)/gi;
    let totalMs = 0;
    let match;
    let hasMatch = false;
    
    while ((match = regex.exec(timeStr)) !== null) {
        hasMatch = true;
        const value = parseInt(match);
        const unit = match.toLowerCase();
        
        if (unit === 'h' || unit === 'ساعة') totalMs += value * 60 * 60 * 1000;
        else if (unit === 'm' || unit === 'دقيقة' || unit === 'د') totalMs += value * 60 * 1000;
        else if (unit === 's' || unit === 'ثانية' || unit === 'ث') totalMs += value * 1000;
    }
    
    if (!hasMatch) {
        const pureNum = parseInt(timeStr.replace(/\D/g, ''));
        if (!isNaN(pureNum)) totalMs = pureNum * 60 * 1000;
    }
    return totalMs;
}

function isCloseMatch(input, target) {
    const s1 = input.toLowerCase();
    const s2 = target.toLowerCase();
    if (s1.startsWith(s2) || s2.startsWith(s1)) return true;
    
    let editDistance = 0;
    const maxLen = Math.max(s1.length, s2.length);
    for (let i = 0; i < maxLen; i++) {
        if (s1[i] !== s2[i]) editDistance++;
    }
    return editDistance <= 2;
}

client.once('ready', async () => {
    console.log("==========================================");
    console.log("READY - BOT IS RUNNING STABLE");
    console.log(`🌐 إجمالي السيرفرات المتصلة حالياً: [ ${client.guilds.cache.size} سيرفرات ]`);
    console.log("==========================================");

    const commands = [new SlashCommandBuilder().setName('المتصدرون').setDescription('🏆 عرض قائمة جميع وسطاء السيرفر مرتبين من الأعلى تقييماً إلى الأقل.')].map(command => command.toJSON());
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (error) { console.error(error); }
});
client.on('messageCreate', async (message) => {
    if (message.author.id === client.user.id) return;

    const currentMsgText = message.content.trim();

    if (currentMsgText === 'تقييم') {
        const chName = message.channel.name.toLowerCase();
        if (!chName.startsWith('ticket-')) return;

        const blockListRegex = /(كرستال|كريستال|crystal|دعم|فني|support|رتبة|og|rank|role)/i;
        if (blockListRegex.test(chName)) return;

        const hasMediatorRole = message.member.roles.cache.some(role => {
            const rName = role.name.toLowerCase();
            return rName.includes('وسيط') || rName.includes('الوسيط') || rName.includes('broker') || rName.includes('mediator');
        });
        if (!hasMediatorRole) return;

        const activeTicketKey = `active_${message.channel.id}`;
        const lastSentTime = tempRatings.get(activeTicketKey);
        const now = Date.now();
        if (lastSentTime && (now - lastSentTime < 5000)) return;

        tempRatings.set(activeTicketKey, now);

        const ratingLobbyEmbed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('⭐️ نظام تقييم عمليات الوسطاء المعتمد')
            .setDescription(`مرحباً بك عزيزي العضو، يرجى الضغط على الزر الأخضر أدناه لوضع مراجعكتك وتقييمك الصافي للوسيط الحالي: <@${message.author.id}>`)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`secure_vote_init_${message.id}`).setLabel('تقييم الوسيط').setStyle(ButtonStyle.Success).setEmoji('1537439699386241064')
        );

        await message.channel.send({ embeds: [ratingLobbyEmbed], components: [row] });
        
        tempRatings.set(`secure_data_${message.id}`, { 
            takenBy: `<@${message.author.id}>`,
            ticketName: message.channel.name,
            brokerId: message.author.id,
            votedUsers: [],
            ticketChannelId: message.channel.id
        });
        return;
    }

    if (currentMsgText === 'ريست النقاط' && message.channel.name === 'تقييم・الوسطاء〡🏆') {
        if (!message.member.permissions.has('ManageGuild') && !message.member.permissions.has('Administrator')) {
            return message.reply({ content: '❌ عذراً، هذا الأمر مخصص فقط لإدارة السيرفر الكبرى!' });
        }
        fs.writeFileSync(DB_PATH, JSON.stringify({ brokers: {} }, null, 4));
        const resetEmbed = new EmbedBuilder().setColor('#e74c3c').setTitle('⚡ تم تصفير قاعدة بيانات النقاط بنجاح!').setDescription('📢 تم إعادة ضبط كافة النقاط الكلية للصفر لبدء موسم جديد للجميع.').setTimestamp();
        return message.reply({ embeds: [resetEmbed] });
    }

    const msgArgs = currentMsgText.split(/ +/);
    const commandName = msgArgs; 

    if (commandName === 'مساعده' || commandName === 'مساعدة') {
        if (message.channel.name !== 'تقييم・الوسطاء〡🏆') return;
        if (message.author.username !== 'mrxx0010') return;
        const helpEmbed = new EmbedBuilder()
            .setColor('#101010')
            .setTitle('💡 دليل رسايل التحكم وإرشادات الإضافة والخصم الصافي:')
            .setDescription('يمكنك كتابة الأوامر كرسائل عادية بالتنسيق التالي:\n\n' +
                            `🟢 **زيد [الرقم] [@الوسيط]** ⬅️ لإضافة نقاط صدارة صافية (أو بالرد على رسالته).\n` +
                            `🔴 **نقص [الرقم] [@الوسيط]** ⬅️ لخصم وتنزيل نقاط الصدارة بقيمة دقيقة.\n` +
                            `⚡ **ريسيت [@الوسيط]** ⬅️ لتصفير ومسح سجل وسيط فردي وإعادته للـ الصفر.`)
            .setTimestamp();
        const helpMsg = await message.reply({ embeds: [helpEmbed] });
        setTimeout(() => { helpMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 30000);
        return;
    }

    if (commandName === 'زيد' || commandName === 'نقص' || commandName === 'ريسيت') {
        if (message.channel.name !== 'تقييم・الوسطاء〡🏆') return;
        if (message.author.username !== 'mrxx0010') return;

        let targetMember = message.mentions.members.first();
        if (!targetMember && message.reference) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                targetMember = await message.guild.members.fetch(repliedMessage.author.id);
            } catch (e) {}
        }

        if (commandName === 'ريسيت') {
            if (!targetMember) return message.reply({ content: '❌ الصيغة الصحيحة: `ريسيت @الوسيط`' });
            const db = getDatabase();
            db.brokers[targetMember.id] = { totalOperations: 0, treatment: { excellent: 0, good: 0, bad: 0 }, speed: { excellent: 0, good: 0, bad: 0 }, history: [] };
            fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 4));
            return message.reply({ content: `⚡ **تم التصفير بنجاح للوسيط:** ${targetMember}` });
        }

        const pointsNum = parseInt(msgArgs);
        if (isNaN(pointsNum) || pointsNum <= 0 || !targetMember) {
            return message.reply({ content: `❌ الصيغة الصحيحة: \`زيد [الرقم] [@الوسيط]\`` });
        }

        const db = getDatabase();
        const brokerId = targetMember.id;
        if (!db.brokers[brokerId]) {
            db.brokers[brokerId] = { totalOperations: 0, treatment: { excellent: 0, good: 0, bad: 0 }, speed: { excellent: 0, good: 0, bad: 0 }, history: [] };
        }

        const successEmbed = new EmbedBuilder().setTimestamp();
        if (commandName === 'زيد') {
            db.brokers[brokerId].totalOperations += 1;
            db.brokers[brokerId].treatment.excellent += (pointsNum / 3);
            successEmbed.setColor('#2ecc71').setTitle('✅ تم إضافة النقاط بنجاح!').setDescription(`تمت زيادة نقاط الوسيط ${targetMember} بقيمة \`+${pointsNum}\` نقطة.`);
        } else if (commandName === 'نقص') {
            if (db.brokers[brokerId].totalOperations > 0) db.brokers[brokerId].totalOperations -= 1;
            db.brokers[brokerId].treatment.bad += (pointsNum / 2);
            successEmbed.setColor('#e74c3c').setTitle('📉 تم خصم النقاط بنجاح!').setDescription(`تم خصم نقاط الوسيط ${targetMember} بقيمة \`-${pointsNum}\` نقطة.`);
        }

        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 4));
        const successMsg = await message.reply({ embeds: [successEmbed] });
        setTimeout(() => { successMsg.delete().catch(() => {}); message.delete().catch(() => {}); }, 30000);
        return;
    }
});
client.on('messageCreate', async (message) => {
    if (message.author.id === client.user.id) return;

    const rawText = message.content.trim();
    const args = rawText.split(/ +/);
    const commandIn = args ? args.toLowerCase() : '';

    // 🔒 حظر تشغيل وعمل أوامر التايمر نهائياً خارج روم "توقيت・〡timer⏲️" الجديد بطلبك الصريح كلياً الحين
    if (message.channel.name !== 'توقيت・〡timer%ef%b8%8f') return;

    const userTimerKey = `timer_${message.channel.id}_${message.author.id}`;

    if (commandIn === 'stop') {
        if (activeTimers.has(userTimerKey)) {
            const timerData = activeTimers.get(userTimerKey);
            clearTimeout(timerData.timeoutId); 
            
            try { await timerData.replyMessage.delete().catch(() => {}); } catch(e) {}
            activeTimers.delete(userTimerKey);

            const stopEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setAuthor({ name: message.author.displayName, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                .setTitle('🛑 تم إلغاء وإيقاف المؤقت الزمني')
                .setDescription(`📢 تم بنجاح إنهاء العداد التنازلي الحالي بطلب رسمي من صاحب التايمر: <@${message.author.id}>`)
                .setTimestamp();
            return message.reply({ embeds: [stopEmbed] });
        } else {
            return message.reply({ content: '❌ عذراً يا غالي، لا يوجد لديك أي مؤقت زمني نشط حالياً داخل هذه القناة لإيقافه!' });
        }
    }

    if (commandIn === 'تايم' || commandIn === 'مؤقت' || isCloseMatch(commandIn, 'تايم')) {
        const durationStr = args.slice(1).join(' ');
        
        if (!durationStr) {
            const errEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('⚠️ خطأ في صيغة تشغيل المؤقت:')
                .setDescription(`يرجى تحديد الوقت المطلوب بشكل واضح كالتالي:\n📝 \`${commandIn} [الوقت]\` (أمثلة: \`${commandIn} 5m\` أو \`${commandIn} 52s\`)`);
            return message.reply({ embeds: [errEmbed] });
        }

        const durationMs = parseDuration(durationStr);
        if (durationMs <= 0 || durationMs > 24 * 60 * 60 * 1000) {
            const boundEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('❌ وقت غير صالح أو مبالغ فيه:')
                .setDescription('يرجى إدخال وقت صحيح يتراوح بين ثانية واحدة و 24 ساعة كحد أقصى.');
            return message.reply({ embeds: [boundEmbed] });
        }

        if (activeTimers.has(userTimerKey)) {
            clearTimeout(activeTimers.get(userTimerKey).timeoutId);
        }

        const targetTime = Date.now() + durationMs;
        const endTimeSeconds = Math.floor(targetTime / 1000);

        const timerEmbed = new EmbedBuilder()
            .setColor('#121212') 
            .setAuthor({ name: message.author.displayName, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTitle('⏳ تم تنشيط العداد التنازلي الشامل')
            .setDescription(`⏱️ **المدة الكلية المطلوبة:** \`${durationStr}\``)
            .setFooter({ text: 'محرك إدارة الوقت الآلي لسيرفرك' });

        const finalContent = `# ⏳ **الوقت الرقمي المستهدف المستقر:**\n# <t:${endTimeSeconds}:T>\n\n🏁 **ينتهي العداد التنازلي بالثواني حياً الحين:**\n# <t:${endTimeSeconds}:R>`;

        const replyMessage = await message.reply({ content: finalContent, embeds: [timerEmbed] });

        const timeoutId = setTimeout(async () => {
            try {
                activeTimers.delete(userTimerKey);
                const endEmbed = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setAuthor({ name: message.author.displayName, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
                    .setTitle('🏁 انتهى الوقت الكلي للمؤقت!')
                    .setDescription(`⏱️ **المدة الكلية المنقضية الكلية:** \`${durationStr}\``);
                
                await replyMessage.edit({ content: `# 🏁 **00:00:00**\n# **اكتمل المؤقت بنجاح الكلي!**`, embeds: [endEmbed] }).catch(() => {});
                return message.channel.send({ content: `⏰ | انتهى الوقت الكلي للمؤقت الخاص بك بنجاح يا غالي! <@${message.author.id}>` });
            } catch (e) {}
        }, durationMs);

        activeTimers.set(userTimerKey, { timeoutId, replyMessage });
    }
});
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'المتصدرون') {
        if (interaction.channel.name !== 'تقييم・الوسطاء〡🏆') {
            return interaction.reply({ content: '❌ عذراً، هذا الأمر مخصص للاستخدام فقط داخل روم التقييمات المعتمد!', ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: false }); 
        const db = getDatabase(); const selectOptions = []; const finalBrokersList = new Map();
        try {
            const allMembers = await interaction.guild.members.fetch();
            allMembers.forEach(member => {
                const hasMediatorRole = member.roles.cache.some(role => { const rName = role.name.toLowerCase(); return rName.includes('وسيط') || rName.includes('الوسيط') || rName.includes('broker') || rName.includes('mediator'); });
                if (hasMediatorRole) finalBrokersList.set(member.id, { id: member.id, score: 0, total: 0, name: member.displayName || member.user.username });
            });
            Object.keys(db.brokers).forEach(id => {
                const b = db.brokers[id]; 
                const calculatedScore = Math.round(((b?.treatment?.excellent || 0) + (b?.speed?.excellent || 0)) * 3 + ((b?.treatment?.good || 0) + (b?.speed?.good || 0)) * 1 - ((b?.treatment?.bad || 0) + (b?.speed?.bad || 0)) * 2);
                if (finalBrokersList.has(id)) { const existing = finalBrokersList.get(id); existing.score = calculatedScore; existing.total = Math.round(b?.totalOperations || 0); }
                else { finalBrokersList.set(id, { id: id, score: calculatedScore, total: Math.round(b?.totalOperations || 0), name: `عضو مغادر/بدون رتبة` }); }
            });
            const sortedBrokers = Array.from(finalBrokersList.values()).sort((a, b) => b.score - a.score);
            if (sortedBrokers.length === 0) return interaction.editReply({ content: '❌ لم يتم العثور على أي وسطاء لبناء اللوحة!' });
            const leaderboardEmbed = new EmbedBuilder().setColor('#f1c40f').setTitle('🏆 لوحة الترتيب الشامل لجميع وسطاء السيرفر').setDescription('لوحة صدارة نقاط وسطاء السيرفر مرتبة تنازلياً بقيم صافية ومحدثة:').setTimestamp();
            let leaderboardText = "";
            for (let i = 0; i < sortedBrokers.length; i++) {
                const item = sortedBrokers[i]; let medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '👤';
                leaderboardText += `${medal} **المركز ${i+1}:** <@${item.id}> \n └ العمليات: \`${item.total}\` | النقاط الكلية: \`${item.score}\`\n\n`;
                selectOptions.push({ label: item.name.slice(0, 25), description: `المركز ${i+1} | النقاط: ${item.score}`, value: `view_broker_${item.id}` });
            }
            leaderboardEmbed.addFields({ name: '📊 لستة الوسطاء مرتبة بالكامل:', value: leaderboardText || 'لا يوجد وسطاء مسجلين' });
            return interaction.editReply({ embeds: [leaderboardEmbed], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('leaderboard_select_broker').setPlaceholder('🎯 اضغط هنا واختـر الوسيط لعرض كافة تقييماته...').addOptions(selectOptions.slice(0, 25)))] });
        } catch (e) { return interaction.editReply({ content: '❌ حدث خطأ داخلي.' }); }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'leaderboard_select_broker') {
        try {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});
            const selectedValue = interaction.values; const brokerId = selectedValue.replace('view_broker_', ''); const db = getDatabase();
            const bData = db.brokers[brokerId] || { totalOperations: 0, treatment: { excellent: 0, good: 0, bad: 0 }, speed: { excellent: 0, good: 0, bad: 0 }, history: [] };
            const cleanData = { totalOperations: Math.round(bData?.totalOperations || 0), treatment: { excellent: Math.round(bData?.treatment?.excellent || 0), good: Math.round(bData?.treatment?.good || 0), bad: Math.round(bData?.treatment?.bad || 0) }, speed: { excellent: Math.round(bData?.speed?.excellent || 0), good: Math.round(bData?.speed?.good || 0), bad: Math.round(bData?.speed?.bad || 0) }, history: bData?.history || [] };
            return interaction.editReply({ embeds: [createBrokerEmbed(cleanData, brokerId, interaction.guild.iconURL())] });
        } catch (e) { console.error(e); }
    }

    if (!interaction.isButton()) return;
    const parts = interaction.customId.split('_');

    if (parts === 'secure' && parts === 'vote' && parts === 'init') {
        try {
            const idKey = parts;
            const tData = tempRatings.get(`secure_data_${idKey}`);
            if (!tData) return interaction.reply({ content: '❌ عذراً، انتهت صلاحية هذه الجلسة التقييمية.', ephemeral: true });
            if (interaction.user.id === tData.brokerId) return interaction.reply({ content: '❌ عذراً، لا يمكنك تقييم نفسك نهائياً!', ephemeral: true });
            let usersList = tData.votedUsers || [];
            if (usersList.includes(interaction.user.id)) return interaction.reply({ content: '❌ عذراً، لقد قمت بتقديم تقييمك للوسيط داخل هذه التذكرة سابقاً!', ephemeral: true });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`secstep_excellent_${idKey}`).setLabel('ممتاز 🟢').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`secstep_good_${idKey}`).setLabel('جيد 🟡').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`secstep_bad_${idKey}`).setLabel('سيئ 🔴').setStyle(ButtonStyle.Danger)
            );
            return interaction.reply({ content: `🎫 **خطوة 1 من 2:** الرجاء تحديد مستوى أسلوب وتعامل الوسيط معك:`, components: [row], ephemeral: true });
        } catch (e) { console.error(e); }
    }

    if (parts === 'secstep') {
        try {
            const choice = parts; const idKey = parts;
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`secfinal_${choice}_excellent_${idKey}`).setLabel('ممتاز 🟢').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`secfinal_${choice}_good_${idKey}`).setLabel('جيد 🟡').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`secfinal_${choice}_bad_${idKey}`).setLabel('سيئ 🔴').setStyle(ButtonStyle.Danger)
            );
            return interaction.update({ content: `⚡ **خطوة 2 من 2:** الرجاء تحديد مستوى سرعة إنجاز وتسليم الوسيط للصفقة:`, components: [row] });
        } catch (e) { console.error(e); }
    }

    if (parts === 'secfinal') {
        try {
            const treatmentResult = parts; const speedResult = parts; const idKey = parts;
            const tData = tempRatings.get(`secure_data_${idKey}`);
            if (!tData) return interaction.update({ content: '❌ عذراً، انتهت صلاحية الجلسة أثناء الحفظ.', components: [] });
            if (tData.votedUsers.includes(interaction.user.id)) return interaction.update({ content: '❌ عذراً، لقد قمت بالتصويت مسبقاً!', components: [] });

            let treatArabic = treatmentResult === 'excellent' ? 'ممتاز' : treatmentResult === 'good' ? 'جيد' : 'سيئ';
            let speedArabic = speedResult === 'excellent' ? 'ممتاز' : speedResult === 'good' ? 'جيد' : 'سيئ';

            const cleanBrokerId = tData.takenBy.replace(/[<@!>]/g, '').trim();
            saveRatingToDB(cleanBrokerId, treatArabic, speedArabic, `<@${interaction.user.id}>`, `${tData.ticketName}`);
            
            tData.votedUsers.push(interaction.user.id);
            tempRatings.set(`secure_data_${idKey}`, tData);

            try { await interaction.channel.send({ content: `📢 | العضو <@${interaction.user.id}> قام بتقديم تقييمه للوسيط داخل هذه التذكرة بنجاح! ✅` }); } catch (e) {}
            tempRatings.delete(`active_${tData.ticketChannelId}`);

            const publicEvalChannel = interaction.guild.channels.cache.find(c => c.name.includes('تقييم') && (c.name.includes('الوسطاء' ) || c.name.includes('وسطاء')));
            if (publicEvalChannel) {
                const publicEmbed = new EmbedBuilder().setColor('#2ecc71').setTitle('🏆 تم تسجيل ونشر تقييم جديد للعملية الناجحة').addFields({ name: '👑 الوسيط المسؤول والمستلم:', value: tData.takenBy, inline: true }, { name: '👤 العضو صاحب التقييم:', value: `<@${interaction.user.id}>`, inline: true }, { name: '🎫 مسمى قناة العملية الناجحة:', value: `\`${tData.ticketName}\``, inline: true }, { name: '💬 تقييم أسلوب التعامل:', value: `\`${treatArabic}\``, inline: true }, { name: '⚡ تقييم سرعة تسليم وإنجاز الصفقات:', value: `\`${speedArabic}\``, inline: true }).setTimestamp().setFooter({ text: 'تقييم الوسطاء المطور والآمن لسيرفرك', iconURL: interaction.guild.iconURL() });
                await publicEvalChannel.send({ embeds: [publicEmbed] });
            }
            return interaction.update({ content: '✅ **بيض الله وجهك!** تم إرسال وحفظ مراجعتك بنجاح وعُدلت الإحصائيات الحية بالسجلات!', components: [] });
        } catch (error) { console.error(error); }
    }
});

client.login(process.env.TOKEN);
