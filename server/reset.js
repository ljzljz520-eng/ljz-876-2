// 重置数据库（删除所有数据并重新种子）
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dbFiles = ['driving_school.db', 'driving_school.db-wal', 'driving_school.db-shm'];

for (const file of dbFiles) {
  const filePath = path.join(dataDir, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log('已删除:', file);
  }
}

// 重新加载种子
require('./seed');
console.log('数据库重置完成。');
