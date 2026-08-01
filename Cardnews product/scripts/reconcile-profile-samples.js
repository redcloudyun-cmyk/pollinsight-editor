require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const mysql = require('mysql2/promise');
const sampleProfileDesigns = require('../sample-profile-designs');

const keepSlugs = new Set([
  'sample-community',
  'sample-policy',
  'sample-creator',
  'sample-consultant',
  'sample-portfolio',
  'sample-trainer',
  'sample-content-director'
]);

const social = {
  facebook: 'https://www.facebook.com/',
  youtube: 'https://www.youtube.com/',
  instagram: 'https://www.instagram.com/',
  blog: 'https://blog.naver.com/'
};

const photos = {
  'sample-community': '/assets/politician-mobile-card-samples/assets/seo-rin.png',
  'sample-policy': '/assets/politician-mobile-card-samples/assets/min-seok.png',
  'sample-creator': '/assets/profile-samples/fictional-han-soyeon-creator.png',
  'sample-consultant': '/assets/politician-mobile-card-samples/assets/ga-eun.png',
  'sample-portfolio': '/assets/politician-mobile-card-samples/assets/yu-jin.png',
  'sample-trainer': '/assets/profile-samples/candidate-lee-dohyun.png',
  'sample-content-director': '/assets/politician-mobile-card-samples/assets/do-yoon.png'
};

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    const [rows] = await connection.query(
      "SELECT id, title, slug, profile_data FROM digital_profiles WHERE slug LIKE 'sample-%' ORDER BY id"
    );
    const remove = rows.filter(row => !keepSlugs.has(row.slug));
    const keep = rows.filter(row => keepSlugs.has(row.slug));

    await connection.beginTransaction();
    if (remove.length) {
      const ids = remove.map(row => row.id);
      await connection.query('DELETE FROM digital_profile_events WHERE profile_id IN (?)', [ids]);
      await connection.query('DELETE FROM digital_profile_applications WHERE profile_id IN (?)', [ids]);
      await connection.query('DELETE FROM digital_profiles WHERE id IN (?)', [ids]);
    }

    for (const row of keep) {
      const data = sampleProfileDesigns[row.slug] || (typeof row.profile_data === 'string' ? JSON.parse(row.profile_data || '{}') : (row.profile_data || {}));
      data.social ||= social;
      data.photo ||= photos[row.slug] || '';
      if (Array.isArray(data.pages)) {
        data.pages.forEach(page => {
          if (page.type === 'video' && !page.videoUrl) {
            page.videoUrl = 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
          }
        });
      }
      await connection.query('UPDATE digital_profiles SET profile_data = ? WHERE id = ?', [JSON.stringify(data), row.id]);
    }
    await connection.commit();

    console.log(JSON.stringify({
      kept: keep.map(row => row.slug),
      removed: remove.map(row => row.slug),
      visibleSampleCount: keep.length + 1
    }, null, 2));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
