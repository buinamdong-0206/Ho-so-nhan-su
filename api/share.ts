import { VercelRequest, VercelResponse } from '@vercel/node';
import path from 'path';
import fs from 'fs';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { listId } = req.query;
  
  if (!listId || Array.isArray(listId)) {
    return res.status(400).send('Invalid List ID');
  }

  try {
    // Load Firebase Config
    let config;
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      console.error('Config read error:', e);
      return res.status(500).send('Lỗi cấu hình hệ thống: Không tìm thấy file cấu hình Firebase.');
    }
    
    const projectId = config.projectId;
    const databaseId = config.firestoreDatabaseId || '(default)';
    
    // Fetch List from Firestore REST API
    const listRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/custom_lists/${listId}`);
    if (!listRes.ok) {
      return res.status(404).send('<h1>404</h1><p>Không tìm thấy danh sách này trong cơ sở dữ liệu.</p>');
    }
    const listDoc = await listRes.json();
    
    // Helper to extract fields from Firestore JSON
    const extract = (fields: any) => {
      const result: any = {};
      if (!fields) return result;
      for (const key in fields) {
        const val = fields[key];
        if (val.stringValue !== undefined) result[key] = val.stringValue;
        else if (val.integerValue !== undefined) result[key] = parseInt(val.integerValue);
        else if (val.booleanValue !== undefined) result[key] = val.booleanValue;
        else if (val.arrayValue !== undefined) {
          result[key] = val.arrayValue.values ? val.arrayValue.values.map((v: any) => {
            if (v.mapValue) return extract(v.mapValue.fields);
            if (v.stringValue !== undefined) return v.stringValue;
            if (v.integerValue !== undefined) return parseInt(v.integerValue);
            return v;
          }) : [];
        }
        else if (val.mapValue !== undefined) result[key] = extract(val.mapValue.fields);
      }
      return result;
    };

    const listData = extract(listDoc.fields);
    const profileIds = listData.profileIds || [];
    
    // Load local profiles data to speed up lookup
    let localProfiles: any[] = [];
    try {
      const profilesPath = path.join(process.cwd(), 'profiles_data.json');
      if (fs.existsSync(profilesPath)) {
        const localData = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
        localProfiles = localData.profiles || [];
      }
    } catch (e) {
      console.error('Local profiles read error:', e);
    }

    // Fetch all profiles in the list
    const profiles: any[] = [];
    const careers: Record<number, any[]> = {};
    
    // Limit concurrency to avoid timeouts/crashes
    const fetchProfileData = async (id: any) => {
      try {
        // 1. Try local data first
        let pData = localProfiles.find(p => p.id === id || p.id === parseInt(id));
        
        // 2. If not found locally, fetch from Firestore
        if (!pData) {
          const pRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/profiles/${id}`);
          if (pRes.ok) {
            const pDoc = await pRes.json();
            pData = extract(pDoc.fields);
            pData.id = id;
          }
        }

        if (pData) {
          if (!pData.id) pData.id = id;
          profiles.push(pData);
          
          // 3. Fetch career from external API (only if needed or always?)
          // To keep it fast, we could skip this if it's too slow, but the user wants it.
          const cRes = await fetch(`https://api.daihoidangtoanquoc.vn/api/profiles/get/political-career?profileId=${id}`);
          if (cRes.ok) {
            const cData = await cRes.json();
            careers[id] = cData.data;
          }
        }
      } catch (e) {
        console.error(`Error processing profile ${id}:`, e);
      }
    };

    // Process in chunks of 10 to avoid hitting limits
    const chunks = [];
    for (let i = 0; i < profileIds.length; i += 10) {
      chunks.push(profileIds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(id => fetchProfileData(id)));
    }

    // Generate HTML
    const html = generateCompiledHtml(listData, profiles, careers);
    
    // Set headers for iframing
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    
    return res.status(200).send(html);
    
  } catch (error) {
    console.error('Share error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).send(`<h1>Lỗi khi tạo trang chia sẻ</h1><p>${errorMessage}</p>`);
  }
}

function generateCompiledHtml(list: any, profiles: any[], careers: any) {
    // Escape data for safe injection into a script tag
    const safeJson = (data: any) => JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/'/g, '\\u0027');
    
    // Escape for template literal backticks and interpolation
    const escapeForTemplate = (str: string) => str.replace(/`/g, '\\`').replace(/\${/g, '\\${');
    
    const profilesData = escapeForTemplate(safeJson(profiles));
    const careersData = escapeForTemplate(safeJson(careers));
    const groupsData = escapeForTemplate(safeJson(list.groups || []));
    const listName = list.name || 'Danh sách nhân sự';
    
    return `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeForTemplate(listName)}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; }
        .career-table { width: 100%; border-collapse: collapse; }
        .career-table tr:hover { background-color: rgba(239, 246, 255, 0.5); }
        .career-table td { padding: 16px 0; border-bottom: 1px solid #f9fafb; }
        .time-cell { white-space: nowrap; padding-right: 32px; font-weight: 700; color: #111827; vertical-align: top; width: 25%; }
        .content-cell { color: #4b5563; line-height: 1.625; vertical-align: top; }
        .marker { width: 6px; height: 6px; background-color: #3b82f6; border-radius: 9999px; flex-shrink: 0; margin-top: 6px; }
        
        #modal-overlay { display: none; position: fixed; inset: 0; z-index: 50; background-color: rgba(0,0,0,0.4); backdrop-filter: blur(4px); align-items: center; justify-content: center; padding: 16px; }
        #modal-content { background: white; width: 100%; max-width: 896px; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; position: relative; }
        .modal-body { flex: 1; overflow-y: auto; padding: 24px; }
        @media (min-width: 640px) { .modal-body { padding: 40px; } }
        
        .line-clamp-1 { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    </style>
</head>
<body class="bg-gray-50 text-gray-900">
    <div class="min-h-screen flex flex-col">
        <header class="bg-white border-b border-gray-200 py-12 px-4 text-center">
            <h1 class="text-4xl font-extrabold text-gray-900 mb-2">${escapeForTemplate(listName)}</h1>
            <div class="w-24 h-1 bg-blue-600 mx-auto rounded-full"></div>
        </header>

        <main id="main-content" class="flex-1 max-w-7xl mx-auto w-full p-6 md:p-12">
        </main>

        <footer class="bg-white border-t border-gray-200 py-8 text-center text-sm text-gray-500">
            <p>© 2026 Hồ sơ nhân sự. Dữ liệu được cung cấp bởi Đại hội Đảng toàn quốc.</p>
        </footer>
    </div>

    <div id="modal-overlay" onclick="closeModal(event)">
        <div id="modal-content" onclick="event.stopPropagation()">
            <button onclick="closeModal()" class="absolute top-4 right-4 z-10 p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <div id="modal-body-content" class="modal-body">
            </div>
            <div class="p-6 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button onclick="closeModal()" class="px-8 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-100 transition-all shadow-sm">Đóng cửa sổ</button>
            </div>
        </div>
    </div>

    <script>
        const profiles = ${profilesData};
        const careers = ${careersData};
        const groups = ${groupsData};

        function renderContent() {
            const container = document.getElementById('main-content');
            if (groups.length > 0) {
                groups.forEach(group => {
                    const groupDiv = document.createElement('div');
                    groupDiv.className = "text-center mb-16";
                    groupDiv.innerHTML = '<h3 class="text-xl font-bold text-gray-900 mb-8 pb-2 border-b-2 border-blue-500 inline-block">' + group.name + '</h3>';
                    
                    const flexContainer = document.createElement('div');
                    flexContainer.className = "flex flex-wrap justify-center gap-6";
                    
                    group.profileIds.forEach(id => {
                        const p = profiles.find(prof => prof.id === id);
                        if (p) {
                            flexContainer.appendChild(createProfileCard(p));
                        }
                    });
                    
                    groupDiv.appendChild(flexContainer);
                    container.appendChild(groupDiv);
                });
            } else {
                const flexContainer = document.createElement('div');
                flexContainer.className = "flex flex-wrap justify-center gap-6";
                profiles.forEach(p => {
                    flexContainer.appendChild(createProfileCard(p));
                });
                container.appendChild(flexContainer);
            }
        }

        function createProfileCard(p) {
            const card = document.createElement('div');
            card.className = "bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all group w-[140px] sm:w-[160px] md:w-[180px]";
            card.onclick = () => openModal(p.id);
            card.innerHTML = 
                '<div class="w-full aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 mb-3">' +
                    '<img src="' + p.avatar_url + '" alt="' + p.name + '" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">' +
                '</div>' +
                '<div class="w-full px-1">' +
                    '<h4 class="font-bold text-sm text-gray-900 uppercase mb-1 line-clamp-2 min-h-[2.5rem] flex items-center justify-center">' + p.name + '</h4>' +
                    '<p class="text-[10px] text-blue-600 font-bold leading-tight uppercase line-clamp-3">' + p.main_title + '</p>' +
                '</div>';
            return card;
        }

        function openModal(id) {
            const profile = profiles.find(p => p.id === id);
            if (!profile) return;

            const profileCareers = careers[id] || [];
            let careerHtml = "";
            if (profileCareers.length > 0) {
                careerHtml = '<div class="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">' +
                    '<table class="career-table">' +
                        '<tbody class="divide-y divide-gray-50">' +
                            profileCareers.map(c => {
                                const clean = c.description.replace(/<[^>]*>/g, '').trim();
                                const colon = clean.indexOf(':');
                                const time = colon > 0 && colon < 35 ? clean.slice(0, colon+1) : '';
                                const text = colon > 0 && colon < 35 ? clean.slice(colon+1) : clean;
                                return '<tr>' +
                                    '<td class="time-cell">' +
                                        '<div class="flex items-start gap-3">' +
                                            '<div class="marker"></div>' +
                                            '<span>' + time + '</span>' +
                                        '</div>' +
                                    '</td>' +
                                    '<td class="content-cell">' + text + '</td>' +
                                '</tr>';
                            }).join('') +
                        '</tbody>' +
                    '</table>' +
                '</div>';
            } else {
                careerHtml = '<div class="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200"><p class="text-sm text-gray-400 italic">Không có dữ liệu tiểu sử.</p></div>';
            }

            const birthDayStr = profile.birth_day ? profile.birth_day.toString() : '';
            const formattedBirthDay = birthDayStr.length === 8 
                ? birthDayStr.slice(6,8) + '/' + birthDayStr.slice(4,6) + '/' + birthDayStr.slice(0,4)
                : 'N/A';

            const content = 
                '<div class="flex flex-col md:flex-row gap-8 mb-10">' +
                    '<div class="w-32 h-40 sm:w-48 sm:h-60 flex-shrink-0 mx-auto md:mx-0">' +
                        '<img src="' + profile.avatar_url + '" alt="' + profile.name + '" class="w-full h-full object-contain bg-gray-50 rounded-2xl shadow-sm border border-gray-100">' +
                    '</div>' +
                    '<div class="flex-1">' +
                        '<div class="mb-6 text-center md:text-left">' +
                            '<h2 class="text-3xl font-extrabold text-gray-900 mb-2 uppercase">' + profile.name + '</h2>' +
                            '<p class="text-blue-600 font-bold text-lg leading-snug mb-4">' + profile.main_title + '</p>' +
                        '</div>' +
                        '<section>' +
                            '<h4 class="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 text-center md:text-left">Thông tin cơ bản</h4>' +
                            '<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">' +
                                '<div class="flex items-center gap-3">' +
                                    '<div class="p-2 bg-blue-50 rounded-lg text-blue-600">📍</div>' +
                                    '<div>' +
                                        '<p class="text-[10px] text-gray-400 font-bold uppercase">Quê quán</p>' +
                                        '<p class="text-sm font-bold text-gray-700">' + (profile.hometown || 'N/A') + '</p>' +
                                    '</div>' +
                                '</div>' +
                                '<div class="flex items-center gap-3">' +
                                    '<div class="p-2 bg-blue-50 rounded-lg text-blue-600">📅</div>' +
                                    '<div>' +
                                        '<p class="text-[10px] text-gray-400 font-bold uppercase">Ngày sinh</p>' +
                                        '<p class="text-sm font-bold text-gray-700">' + formattedBirthDay + '</p>' +
                                    '</div>' +
                                '</div>' +
                                '<div class="flex items-center gap-3">' +
                                    '<div class="p-2 bg-blue-50 rounded-lg text-blue-600">🎓</div>' +
                                    '<div>' +
                                        '<p class="text-[10px] text-gray-400 font-bold uppercase">Trình độ</p>' +
                                        '<p class="text-sm font-bold text-gray-700">' + (profile.profession_level || 'N/A') + '</p>' +
                                    '</div>' +
                                '</div>' +
                                '<div class="flex items-center gap-3">' +
                                    '<div class="p-2 bg-blue-50 rounded-lg text-blue-600">👤</div>' +
                                    '<div>' +
                                        '<p class="text-[10px] text-gray-400 font-bold uppercase">Dân tộc</p>' +
                                        '<p class="text-sm font-bold text-gray-700">' + (profile.ethnicity || 'Kinh') + '</p>' +
                                    '</div>' +
                                '</div>' +
                            '</div>' +
                        '</section>' +
                    '</div>' +
                '</div>' +
                '<div class="space-y-10">' +
                    (profile.intro ? '<section class="bg-gray-50 p-6 rounded-2xl border border-gray-100"><h4 class="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Giới thiệu</h4><p class="text-gray-600 text-sm leading-relaxed italic">"' + profile.intro + '"</p></section>' : '') +
                    '<section>' +
                        '<div class="flex items-center gap-3 mb-6">' +
                            '<div class="h-px flex-1 bg-gray-100"></div>' +
                            '<h4 class="text-xs font-bold uppercase tracking-widest text-gray-400">Tóm tắt quá trình công tác</h4>' +
                            '<div class="h-px flex-1 bg-gray-100"></div>' +
                        '</div>' +
                        careerHtml +
                    '</section>' +
                '</div>';

            document.getElementById('modal-body-content').innerHTML = content;
            document.getElementById('modal-overlay').style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        function closeModal(e) {
            document.getElementById('modal-overlay').style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });

        renderContent();
    </script>
</body>
</html>`;
}

