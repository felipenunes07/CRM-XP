import fs from 'fs';

const files = [
    'c:/Users/Felipe/Desktop/CRM XP/CRM-XP/apps/web/src/components/AppShell.js',
    'c:/Users/Felipe/Desktop/CRM XP/CRM-XP/apps/web/src/pages/InventoryPage.js',
    'c:/Users/Felipe/Desktop/CRM XP/CRM-XP/apps/web/src/i18n.js'
];

const replacements = [
    { from: /ä»ªè¡¨ç›˜/g, to: '仪表盘' },
    { from: /ç›®æ ‡/g, to: '目标' },
    { from: /é”€å”®å›¢é˜Ÿ/g, to: '销售团队' },
    { from: /å®¢æˆ·/g, to: '客户' },
    { from: /åº“å­˜/g, to: '库存' },
    { from: /å“ ç‰Œå¤§ä½¿/g, to: '品牌大使' },
    { from: /åˆ†ç¾¤/g, to: '分群' },
    { from: /æ—¥ç¨‹/g, to: '日程' },
    { from: /æ–°å®¢æˆ·/g, to: '新客户' },
    { from: /å”¤é†’/g, to: '唤醒' },
    { from: /æƒ³æ³•\/æŠ•ç¥¨/g, to: '想法/投票' },
    { from: /æ¶ˆæ ¯æ¨¡æ ¿/g, to: '消息模板' },
    { from: /æ‰¹é‡ å发é€/g, to: '批量发送' },
    { from: /èŽ·å®¢å¼€å ‘/g, to: '获客开发' },
    { from: /æ ‡ç­¾/g, to: '标签' },
    { from: /è¯­è¨€/g, to: '语言' },
    { from: /é€‰æ‹©ç•Œé ¢è¯­è¨€/g, to: '选择界面语言' },
    { from: /åˆ‡æ ¢ä¸ºå·´è¥¿è‘¡è „ç‰™è¯­/g, to: '切换为巴西葡萄牙语' },
    { from: /åˆ‡æ ¢ä¸ºä¸­æ–‡/g, to: '切换为中文' },
    { from: /å†…éƒ¨ç”¨æˆ·/g, to: '内部用户' },
    { from: /æ— é‚®ç®±/g, to: '无邮箱' },
    { from: /ç»“æ Ÿä¼šè¯ /g, to: '结束会话' },
    { from: /é€€å‡º/g, to: '退出' },
    { from: /å —ä¿ æŠ¤ä¼šè¯ /g, to: '受保护会话' },
    { from: /æŒ‰ç”¨æˆ·ä¸Žå›¢é˜Ÿæ ƒé™ è¿›è¡Œå†…éƒ¨è®¿é—®æŽ§åˆ¶ã€‚/g, to: '按用户与团队权限进行内部访问控制。' },
    { from: /Â·/g, to: '·' },
    { from: /\u00C2\u00B7/g, to: '·' },
    { from: /\uFFFD/g, to: '·' },
    { from: /å®¢æˆ·è¯¦æƒ…/g, to: '客户详情' },
    { from: /å†…éƒ¨é ¢æ ¿/g, to: '内部面板' }
];

files.forEach(file => {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    replacements.forEach(rep => {
        content = content.replace(rep.from, rep.to);
    });
    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Fixed ${file}`);
    } else {
        console.log(`No changes needed for ${file}`);
    }
});
