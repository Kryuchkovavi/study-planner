/* Учебный планировщик: данные сохраняются в localStorage.
   История хранит недельные снимки отдельно от шаблона постоянного расписания. */
(() => {
  "use strict";
  const STORAGE_KEY = "study-planner-v1";
  const $ = id => document.getElementById(id);
  const DAY_NAMES = ["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];
  const WEEKDAYS = [1,2,3,4,5,6,0];
  const state = loadState();
  let displayedWeek = startOfWeek(new Date());
  let toastTimer = null;
  let editingSubjectSource = null;

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
  function defaultState() {
    return {version:1, settings:{anchorDate:dateKey(new Date()), anchorType:"числитель", importantVisible:true},
      template:[], weeks:{}, important:[], archive:[]};
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || !parsed.settings || !parsed.weeks || !Array.isArray(parsed.template)) return defaultState();
      parsed.important = Array.isArray(parsed.important) ? parsed.important : [];
      parsed.archive = Array.isArray(parsed.archive) ? parsed.archive : [];
      parsed.settings.importantVisible = parsed.settings.importantVisible !== false;
      return parsed;
    } catch (e) { console.error("Не удалось прочитать сохранённые данные", e); return defaultState(); }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { alert("Не удалось сохранить данные. Возможно, в браузере закончилось место. Экспортируйте резервную копию."); }
  }
  function dateKey(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function parseDate(key) { const [y,m,d] = key.split("-").map(Number); return new Date(y,m-1,d); }
  function startOfWeek(date) {
    const d = new Date(date.getFullYear(),date.getMonth(),date.getDate());
    const diff = (d.getDay()+6)%7; d.setDate(d.getDate()-diff); d.setHours(0,0,0,0); return d;
  }
  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate()+n); return d; }
  function weekKey(date) { return dateKey(startOfWeek(date)); }
  function fmtDate(date, options={day:"numeric",month:"short"}) { return new Intl.DateTimeFormat("ru-RU",options).format(date); }
  function weekType(date) {
    const anchor = startOfWeek(parseDate(state.settings.anchorDate || dateKey(new Date())));
    const target = startOfWeek(date);
    const days = Math.round((target-anchor)/86400000);
    const offset = Math.floor(days/7);
    const isAnchorNumerator = state.settings.anchorType === "числитель";
    return ((offset % 2 === 0) === isAnchorNumerator) ? "числитель" : "знаменатель";
  }
  function ensureWeek(date) {
    const key = weekKey(date);
    if (!state.weeks[key]) {
      const type = weekType(date);
      const subjects = state.template.filter(s => s.weekType === "каждую" || s.weekType === type)
        .map(s => ({...structuredCloneSafe(s), id:uid(), templateId:s.id, tasks:[], note:s.note || ""}));
      state.weeks[key] = {subjects, createdAt:new Date().toISOString()};
      save();
    }
    return state.weeks[key];
  }
  function structuredCloneSafe(obj) { return JSON.parse(JSON.stringify(obj)); }
  function escapeText(text) { return String(text ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
  // Пользовательский текст вставляется в DOM только через textContent, кроме атрибутов/шаблонов,
  // где все текстовые значения проходят escapeText().
  function showToast(message) {
    $("toast").textContent = message; $("toast").classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(()=>$("toast").classList.remove("show"), 2200);
  }
  function confirmDelete(message) { return window.confirm(message); }
  function currentWeek() { return ensureWeek(displayedWeek); }

  function renderHeader() {
    const today = new Date();
    $("currentDate").textContent = fmtDate(today,{weekday:"long",day:"numeric",month:"long",year:"numeric"});
    const end = addDays(displayedWeek,6);
    $("weekRange").textContent = `${fmtDate(displayedWeek,{day:"numeric",month:"short"})} — ${fmtDate(end,{day:"numeric",month:"short",year:"numeric"})}`;
    $("weekType").textContent = `Неделя: ${weekType(displayedWeek)}`;
    $("datePicker").value = dateKey(displayedWeek);
  }
  function renderMain() {
    renderHeader();
    $("importantSection").classList.toggle("hidden", !state.settings.importantVisible);
    $("toggleImportant").textContent = state.settings.importantVisible ? "Скрыть" : "Показать";
    renderImportant();
    renderSchedule();
  }
  function renderImportant() {
    const list = $("importantList"); list.replaceChildren();
    const active = state.important;
    $("importantEmpty").classList.toggle("hidden", active.length > 0 || !state.settings.importantVisible);
    active.forEach(item => {
      const card = document.createElement("article"); card.className = "important-card";
      const done = item.tasks.filter(t=>t.done).length;
      card.innerHTML = `<div class="important-title-row"><div class="important-title">${escapeText(item.title)}</div><div class="important-actions">
        <button class="mini-button" data-action="edit-important" data-id="${item.id}" aria-label="Изменить название" title="Изменить">✎</button>
        <button class="mini-button" data-action="finish-important" data-id="${item.id}" aria-label="Завершить дело" title="Завершить">✓</button>
        <button class="mini-button" data-action="delete-important" data-id="${item.id}" aria-label="Удалить дело" title="Удалить">×</button></div></div>
        <div class="important-progress">${done} из ${item.tasks.length} заданий выполнено</div>
        <ul class="important-task-list">${item.tasks.map(t=>taskMarkup(t,"important",item.id)).join("")}</ul>
        <div class="add-task-row important-add"><input data-role="new-important-task" data-id="${item.id}" placeholder="Добавить задание…" aria-label="Новое задание"><button class="secondary-button" data-action="add-important-task" data-id="${item.id}">Добавить</button></div>`;
      list.append(card);
    });
  }
  function taskMarkup(task, type, parentId) {
    return `<li class="task-row ${task.done?"done":""}"><input class="task-check" type="checkbox" data-action="toggle-task" data-type="${type}" data-parent="${parentId}" data-id="${task.id}" ${task.done?"checked":""} aria-label="Отметить выполнение">
      <span class="task-text">${escapeText(task.text)}</span><span class="task-actions">
      <button class="mini-button" data-action="edit-task" data-type="${type}" data-parent="${parentId}" data-id="${task.id}" aria-label="Редактировать задание">✎</button>
      <button class="mini-button" data-action="delete-task" data-type="${type}" data-parent="${parentId}" data-id="${task.id}" aria-label="Удалить задание">×</button></span></li>`;
  }
  function renderSchedule() {
    const root = $("scheduleList"); root.replaceChildren();
    const week = currentWeek();
    if (!week.subjects.length) {
      const empty = document.createElement("p"); empty.className="empty-note";
      empty.textContent = "На этой неделе пока нет предметов. Нажмите «+ Предмет», чтобы добавить занятие.";
      root.append(empty); return;
    }
    WEEKDAYS.forEach(day => {
      const subjects = week.subjects.filter(s=>Number(s.day)===day).sort((a,b)=>a.start.localeCompare(b.start));
      if (!subjects.length) return;
      const group = document.createElement("section"); group.className="day-group";
      const title = document.createElement("h3"); title.className="day-title";
      title.textContent = DAY_NAMES[day]; group.append(title);
      subjects.forEach(s => {
        const card = document.createElement("article"); card.className="subject-card";
        const place = s.placeType === "remote" ? "Дистанционно" : (s.place || "Аудитория не указана");
        const extra = [s.kind,place,s.link].filter(Boolean).join(" · ");
        card.innerHTML = `<div class="subject-top"><div class="subject-main"><h3 class="subject-name">${escapeText(s.name)}</h3>
          <div class="subject-meta">${escapeText(s.start)}–${escapeText(s.end)} · ${escapeText(extra)}${s.weekType!=="каждую"?" · "+escapeText(s.weekType):""}</div></div>
          <div class="subject-actions"><button class="mini-button" data-action="edit-subject" data-id="${s.id}" title="Изменить" aria-label="Изменить предмет">✎</button>
          <button class="mini-button" data-action="copy-subject" data-id="${s.id}" title="Копировать" aria-label="Копировать предмет">⧉</button>
          <button class="mini-button" data-action="delete-subject" data-id="${s.id}" title="Удалить" aria-label="Удалить предмет">×</button></div></div>
          <div class="task-area"><p class="task-heading">Задания</p><ul class="task-list">${s.tasks.map(t=>taskMarkup(t,"subject",s.id)).join("") || '<li class="muted">Заданий пока нет.</li>'}</ul>
          <div class="add-task-row"><input data-role="new-subject-task" data-id="${s.id}" placeholder="Что нужно сделать к занятию?" aria-label="Новое задание"><button class="primary-button" data-action="add-subject-task" data-id="${s.id}">Добавить</button></div></div>
          <div class="note-area">${s.note ? `<button class="note-toggle" data-action="toggle-note" data-id="${s.id}">Показать пометку ▾</button><button class="note-toggle" data-action="edit-note" data-id="${s.id}">Изменить</button><div class="note-content hidden" data-note="${s.id}">${escapeText(s.note)}</div><div class="note-edit hidden" data-note-edit="${s.id}"><textarea rows="3" maxlength="2000">${escapeText(s.note)}</textarea><div class="button-row"><button class="primary-button" data-action="save-note" data-id="${s.id}">Сохранить</button><button class="secondary-button" data-action="delete-note" data-id="${s.id}">Удалить пометку</button></div></div>` : `<button class="note-toggle" data-action="create-note" data-id="${s.id}">+ Добавить пометку</button><div class="note-edit hidden" data-note-edit="${s.id}"><textarea rows="3" maxlength="2000" placeholder="Дополнительная информация…"></textarea><div class="button-row"><button class="primary-button" data-action="save-note" data-id="${s.id}">Сохранить</button><button class="secondary-button" data-action="cancel-note" data-id="${s.id}">Отмена</button></div></div>`}</div>`;
        group.append(card);
      });
      root.append(group);
    });
  }
  function findSubject(id) { return currentWeek().subjects.find(s=>s.id===id); }
  function findImportant(id) { return state.important.find(x=>x.id===id); }
  function findTask(type,parentId,taskId) {
    const parent = type==="subject" ? findSubject(parentId) : findImportant(parentId);
    return parent ? parent.tasks.find(t=>t.id===taskId) : null;
  }
  function openDialog(id) { $(id).showModal(); }
  function closeDialog(dialog) { dialog.close(); }
  function resetSubjectForm() {
    $("subjectForm").reset(); $("subjectId").value=""; $("subjectDialogTitle").textContent="Новый предмет";
    $("subjectPlaceType").value="audience"; updatePlaceLabel();
  }
  function editSubject(id) {
    const s=findSubject(id); if(!s)return;
    $("subjectId").value=s.id; $("subjectName").value=s.name; $("subjectDay").value=String(s.day);
    $("subjectWeek").value=s.weekType; $("subjectStart").value=s.start; $("subjectEnd").value=s.end;
    $("subjectKind").value=s.kind; $("subjectPlaceType").value=s.placeType || "audience";
    $("subjectPlace").value=s.place||""; $("subjectLink").value=s.link||""; $("subjectNote").value=s.note||"";
    $("subjectDialogTitle").textContent="Изменить предмет"; updatePlaceLabel(); openDialog("subjectDialog");
  }
  function updatePlaceLabel() {
    $("placeLabel").firstChild.textContent = $("subjectPlaceType").value==="remote" ? "Платформа / место (необязательно)" : "Аудитория и корпус";
    $("subjectPlace").placeholder = $("subjectPlaceType").value==="remote" ? "Например, Zoom / Teams" : "Например, 305, корпус 2";
  }
  function addSubjectTask(id, text) {
    const s=findSubject(id); if(!s || !text.trim())return;
    s.tasks.push({id:uid(),text:text.trim(),done:false}); save(); renderSchedule();
  }
  function addImportantTask(id,text) {
    const item=findImportant(id); if(!item || !text.trim())return;
    item.tasks.push({id:uid(),text:text.trim(),done:false}); save(); renderImportant();
  }
  function openTaskEditor(type,parentId,taskId="") {
    const task=taskId ? findTask(type,parentId,taskId) : null;
    $("taskSubjectId").value=parentId; $("taskId").value=taskId; $("taskText").value=task?task.text:"";
    $("taskDialogTitle").textContent=task?"Редактировать задание":"Новое задание"; $("taskForm").dataset.type=type; openDialog("taskDialog");
  }
  function openImportantTaskEditor(parentId,taskId="") {
    const item=findImportant(parentId); const task=taskId&&item?item.tasks.find(t=>t.id===taskId):null;
    $("importantTaskParentId").value=parentId; $("importantTaskId").value=taskId; $("importantTaskText").value=task?task.text:"";
    $("importantTaskDialogTitle").textContent=task?"Редактировать задание":"Новое задание"; openDialog("importantTaskDialog");
  }
  function renderArchive() {
    const root=$("archiveList"); root.replaceChildren();
    $("archiveEmpty").classList.toggle("hidden",state.archive.length>0);
    state.archive.slice().reverse().forEach(item=>{
      const card=document.createElement("article"); card.className="archive-card";
      card.innerHTML=`<div class="important-title-row"><div class="important-title">${escapeText(item.title)}</div><div class="important-actions">
        <button class="mini-button" data-action="restore-important" data-id="${item.id}" title="Восстановить" aria-label="Восстановить дело">↶</button>
        <button class="mini-button" data-action="delete-archived" data-id="${item.id}" title="Удалить навсегда" aria-label="Удалить навсегда">×</button></div></div>
        <div class="archive-date">Завершено: ${escapeText(item.completedAt ? fmtDate(new Date(item.completedAt),{day:"numeric",month:"long",year:"numeric"}) : "дата не указана")}</div>
        <details class="archive-details"><summary>Показать задания (${item.tasks.length})</summary><ul class="important-task-list">${item.tasks.map(t=>`<li class="task-row ${t.done?"done":""}"><input class="task-check" type="checkbox" disabled ${t.done?"checked":""}><span class="task-text">${escapeText(t.text)}</span></li>`).join("") || '<li class="muted">Вложенных заданий нет.</li>'}</ul></details>`;
      root.append(card);
    });
  }
  function showView(view) {
    $("mainView").classList.toggle("hidden",view!=="main");
    $("archiveView").classList.toggle("hidden",view!=="archive");
    $("settingsView").classList.toggle("hidden",view!=="settings");
    if(view==="archive")renderArchive();
    if(view==="settings"){ $("anchorDate").value=state.settings.anchorDate; $("anchorType").value=state.settings.anchorType; }
    if(view==="calendar") {
      $("datePicker").showPicker ? $("datePicker").showPicker() : $("datePicker").click();
    }
    closeDrawer();
  }
  function openDrawer(){ $("drawer").classList.add("open"); $("scrim").classList.add("open"); $("drawer").setAttribute("aria-hidden","false"); }
  function closeDrawer(){ $("drawer").classList.remove("open"); $("scrim").classList.remove("open"); $("drawer").setAttribute("aria-hidden","true"); }
  function goToDate(value) {
    if(!value)return; displayedWeek=startOfWeek(parseDate(value)); ensureWeek(displayedWeek); showView("main"); renderMain();
  }
  function exportData() {
    const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download=`uchebny-plan-${dateKey(new Date())}.json`; document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast("Резервная копия подготовлена");
  }
  function validImport(data) {
    return data && data.version===1 && data.settings && typeof data.settings.anchorDate==="string" &&
      ["числитель","знаменатель"].includes(data.settings.anchorType) && Array.isArray(data.template) &&
      data.weeks && typeof data.weeks==="object" && Array.isArray(data.important) && Array.isArray(data.archive);
  }
  function importData(file) {
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const data=JSON.parse(reader.result);
        if(!validImport(data)){alert("Файл не похож на резервную копию этого планировщика или имеет неверную структуру.");return;}
        if(!confirm("Импорт заменит все текущие данные в этом браузере. Перед продолжением экспортируйте текущую копию, если она нужна. Продолжить?"))return;
        localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
        location.reload();
      }catch(e){alert("Не удалось прочитать JSON-файл. Проверьте, что это корректная резервная копия.");}
    };
    reader.onerror=()=>alert("Не удалось прочитать выбранный файл.");
    reader.readAsText(file);
  }

  $("menuButton").addEventListener("click",openDrawer); $("closeMenu").addEventListener("click",closeDrawer); $("scrim").addEventListener("click",closeDrawer);
  document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
  $("prevWeek").addEventListener("click",()=>{displayedWeek=addDays(displayedWeek,-7);ensureWeek(displayedWeek);renderMain();});
  $("nextWeek").addEventListener("click",()=>{displayedWeek=addDays(displayedWeek,7);ensureWeek(displayedWeek);renderMain();});
  $("todayButton").addEventListener("click",()=>{displayedWeek=startOfWeek(new Date());ensureWeek(displayedWeek);showView("main");renderMain();});
  $("pickDateButton").addEventListener("click",()=>{ $("datePicker").showPicker ? $("datePicker").showPicker() : $("datePicker").click(); });
  $("datePicker").addEventListener("change",e=>goToDate(e.target.value));
  $("toggleImportant").addEventListener("click",()=>{state.settings.importantVisible=!state.settings.importantVisible;save();renderMain();});
  $("addImportantButton").addEventListener("click",()=>{$("importantForm").reset();$("importantId").value="";$("importantDialogTitle").textContent="Новое важное дело";openDialog("importantDialog");});
  $("addSubjectButton").addEventListener("click",()=>{resetSubjectForm();openDialog("subjectDialog");});
  $("subjectPlaceType").addEventListener("change",updatePlaceLabel);
  $("subjectForm").addEventListener("submit",e=>{
    e.preventDefault();
    const name=$("subjectName").value.trim(),start=$("subjectStart").value,end=$("subjectEnd").value;
    if(!name){alert("Введите название предмета.");return;} if(!start||!end||start>=end){alert("Укажите корректное время: окончание должно быть позже начала.");return;}
    const data={name,day:Number($("subjectDay").value),weekType:$("subjectWeek").value,start,end,kind:$("subjectKind").value,placeType:$("subjectPlaceType").value,place:$("subjectPlace").value.trim(),link:$("subjectLink").value.trim(),note:$("subjectNote").value.trim()};
    const id=$("subjectId").value;
    if(id){
      const s=findSubject(id);
      if(s){
        Object.assign(s,data);
        // Обновляем шаблон для будущих недель, но не меняем снимки уже сохранённых недель.
        if(s.templateId){const template=state.template.find(t=>t.id===s.templateId);if(template)Object.assign(template,data);}
      }
    } else {
      const template={...data,id:uid()}; state.template.push(template);
      // Предмет появляется в текущей неделе только если его тип недели подходит.
      if(data.weekType==="каждую" || data.weekType===weekType(displayedWeek)) {
        currentWeek().subjects.push({...data,id:uid(),templateId:template.id,tasks:[],note:data.note});
      }
    }
    save();closeDialog($("subjectDialog"));renderMain();showToast(id?"Предмет обновлён":"Предмет добавлен");
  });
  $("copySubjectButton").addEventListener("click",()=>{
    const id=$("subjectId").value;if(!id){showToast("Сначала сохраните предмет");return;}
    $("copySourceId").value=id;$("copyTargetDate").value=dateKey(addDays(displayedWeek,7));closeDialog($("subjectDialog"));openDialog("copyDialog");
  });
  $("copyForm").addEventListener("submit",e=>{
    e.preventDefault();const target=$("copyTargetDate").value,source=findSubject($("copySourceId").value);
    if(!target||!source)return;const wk=ensureWeek(parseDate(target));
    wk.subjects.push({...structuredCloneSafe(source),id:uid(),templateId:null,tasks:source.tasks.map(t=>({...t,id:uid()}))});
    save();closeDialog($("copyDialog"));displayedWeek=startOfWeek(parseDate(target));renderMain();showToast("Предмет скопирован в выбранную неделю");
  });
  $("importantForm").addEventListener("submit",e=>{
    e.preventDefault();const title=$("importantName").value.trim();if(!title)return;
    const id=$("importantId").value;
    if(id){const item=findImportant(id);if(item)item.title=title;}
    else state.important.push({id:uid(),title,tasks:[],createdAt:new Date().toISOString()});
    save();closeDialog($("importantDialog"));renderImportant();
  });
  $("taskForm").addEventListener("submit",e=>{
    e.preventDefault();const type=$("taskForm").dataset.type,parent=$("taskSubjectId").value,id=$("taskId").value,text=$("taskText").value.trim();if(!text)return;
    const p=type==="subject"?findSubject(parent):findImportant(parent);if(!p)return;
    if(id){const t=p.tasks.find(t=>t.id===id);if(t)t.text=text;}else p.tasks.push({id:uid(),text,done:false});
    save();closeDialog($("taskDialog"));type==="subject"?renderSchedule():renderImportant();
  });
  $("importantTaskForm").addEventListener("submit",e=>{
    e.preventDefault();const parent=findImportant($("importantTaskParentId").value),id=$("importantTaskId").value,text=$("importantTaskText").value.trim();if(!parent||!text)return;
    if(id){const t=parent.tasks.find(t=>t.id===id);if(t)t.text=text;}else parent.tasks.push({id:uid(),text,done:false});
    save();closeDialog($("importantTaskDialog"));renderImportant();
  });
  $("saveCalendarSettings").addEventListener("click",()=>{
    const date=$("anchorDate").value,type=$("anchorType").value;if(!date){alert("Выберите опорную дату.");return;}
    state.settings.anchorDate=date;state.settings.anchorType=type;save();renderMain();showToast("Настройки календаря сохранены");
  });
  $("exportButton").addEventListener("click",exportData); $("importButton").addEventListener("click",()=>$("importFile").click());
  $("importFile").addEventListener("change",e=>{importData(e.target.files[0]);e.target.value="";});
  document.querySelectorAll(".close-dialog").forEach(b=>b.addEventListener("click",()=>b.closest("dialog").close()));

  // Делегирование событий: кнопки внутри динамически создаваемых карточек.
  document.addEventListener("click",e=>{
    const b=e.target.closest("[data-action]");if(!b)return;
    const action=b.dataset.action,id=b.dataset.id,type=b.dataset.type,parent=b.dataset.parent;
    if(action==="edit-subject")editSubject(id);
    if(action==="delete-subject"){if(confirmDelete("Удалить этот предмет из выбранной недели? Его задания и пометка этой недели тоже будут удалены.")){const w=currentWeek();w.subjects=w.subjects.filter(s=>s.id!==id);save();renderSchedule();}}
    if(action==="copy-subject"){const s=findSubject(id);if(s){$("copySourceId").value=id;$("copyTargetDate").value=dateKey(addDays(displayedWeek,7));openDialog("copyDialog");}}
    if(action==="add-subject-task"){const input=document.querySelector(`[data-role="new-subject-task"][data-id="${CSS.escape(id)}"]`);if(input&&input.value.trim()){addSubjectTask(id,input.value);}}
    if(action==="add-important-task"){const input=document.querySelector(`[data-role="new-important-task"][data-id="${CSS.escape(id)}"]`);if(input&&input.value.trim())addImportantTask(id,input.value);}
    if(action==="edit-task"){type==="subject"?openTaskEditor(type,parent,id):openImportantTaskEditor(parent,id);}
    if(action==="delete-task"){if(confirmDelete("Удалить это задание?")){const p=type==="subject"?findSubject(parent):findImportant(parent);if(p){p.tasks=p.tasks.filter(t=>t.id!==id);save();type==="subject"?renderSchedule():renderImportant();}}}
    if(action==="edit-important"){const item=findImportant(id);if(item){$("importantId").value=id;$("importantName").value=item.title;$("importantDialogTitle").textContent="Изменить важное дело";openDialog("importantDialog");}}
    if(action==="finish-important"){const idx=state.important.findIndex(x=>x.id===id);if(idx>=0){const item=state.important.splice(idx,1)[0];item.completedAt=new Date().toISOString();state.archive.push(item);save();renderImportant();showToast("Дело перемещено в архив");}}
    if(action==="delete-important"){if(confirmDelete("Удалить важное дело и все его задания без возможности восстановления?")){state.important=state.important.filter(x=>x.id!==id);save();renderImportant();}}
    if(action==="restore-important"){const idx=state.archive.findIndex(x=>x.id===id);if(idx>=0){const item=state.archive.splice(idx,1)[0];delete item.completedAt;state.important.push(item);save();renderArchive();showToast("Дело восстановлено");}}
    if(action==="delete-archived"){if(confirmDelete("Удалить это дело из архива навсегда?")){state.archive=state.archive.filter(x=>x.id!==id);save();renderArchive();}}
    if(action==="toggle-note"){const note=document.querySelector(`[data-note="${CSS.escape(id)}"]`);if(note)note.classList.toggle("hidden");}
    if(action==="create-note"||action==="edit-note"){const edit=document.querySelector(`[data-note-edit="${CSS.escape(id)}"]`);if(edit)edit.classList.toggle("hidden");}
    if(action==="save-note"){const s=findSubject(id),edit=document.querySelector(`[data-note-edit="${CSS.escape(id)}"]`),area=edit?.querySelector("textarea");if(s&&area){s.note=area.value.trim();save();renderSchedule();}}
    if(action==="delete-note"){const s=findSubject(id);if(s&&confirmDelete("Удалить пометку?")){s.note="";save();renderSchedule();}}
    if(action==="cancel-note")renderSchedule();
  });
  document.addEventListener("change",e=>{
    const el=e.target;if(el.dataset.action==="toggle-task"){
      const t=findTask(el.dataset.type,el.dataset.parent,el.dataset.id);if(t){t.done=el.checked;save();if(el.dataset.type==="subject")renderSchedule();else renderImportant();}
    }
  });
  // Быстрое добавление по Enter, без необходимости попадать в кнопку.
  document.addEventListener("keydown",e=>{
    if(e.key!=="Enter"||e.target.tagName!=="INPUT"||!e.target.dataset.role)return;
    e.preventDefault();const id=e.target.dataset.id,text=e.target.value;
    if(e.target.dataset.role==="new-subject-task")addSubjectTask(id,text);
    else addImportantTask(id,text);
  });
  // Начальный запуск не добавляет вымышленные записи. Неделя создаётся из подходящего шаблона.
  ensureWeek(displayedWeek); renderMain();
})();