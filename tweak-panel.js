/**
 * tweak-panel.js — Панель твиков для живого сайта
 * Подключается одной строкой: <script src="tweak-panel.js" defer></script>
 */
(function() {
    'use strict';

    // Проверка локального окружения или наличия ?tweaks
    const isLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname) || location.protocol === 'file:';
    const hasParam = location.search.includes('tweaks') || location.hash.includes('tweaks');
    if (!isLocal && !hasParam) return;

    // Список шрифтов по умолчанию
    const DEFAULT_FONTS = [
        'Использовать исходный',
        'Unbounded',
        'Onest',
        'Golos Text',
        'Geologica',
        'Commissioner',
        'Sofia Sans',
        'Sofia Sans Extra Condensed',
        'Literata',
        'Spectral',
        'Brygada 1918',
        'Tenor Sans',
        'Forum',
        'Dela Gothic One',
        'Russo One',
        'IBM Plex Mono',
        'JetBrains Mono'
    ];
    const fontsList = window.TWEAK_FONTS || DEFAULT_FONTS;

    // Ключ для localStorage на основе pathname
    const storageKey = 'nurtech_tweak_panel_' + (location.pathname || 'index');

    // Функция загрузки шрифта с Google Fonts
    function loadFont(fontName) {
        if (!fontName || fontName === 'Использовать исходный' || fontName === 'default') return;
        const fontId = 'google-font-' + fontName.toLowerCase().replace(/\s+/g, '-');
        if (document.getElementById(fontId)) return;
        
        const link = document.createElement('link');
        link.id = fontId;
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(fontName) + ':wght@300;400;500;600;700;800;900&display=swap';
        document.head.appendChild(link);
    }

    // Сбор CSS-переменных из :root
    function getRootVariables() {
        const variables = new Map(); // имя -> текущее/исходное значение
        try {
            for (let i = 0; i < document.styleSheets.length; i++) {
                const sheet = document.styleSheets[i];
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    if (!rules) continue;
                    for (let j = 0; j < rules.length; j++) {
                        const rule = rules[j];
                        if (rule.selectorText && rule.selectorText.toLowerCase().includes(':root')) {
                            const style = rule.style;
                            if (!style) continue;
                            for (let k = 0; k < style.length; k++) {
                                const propName = style[k];
                                if (propName.startsWith('--')) {
                                    const val = style.getPropertyValue(propName).trim();
                                    if (val && !variables.has(propName)) {
                                        variables.set(propName, val);
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    // Кросс-доменные стили могут вызывать CORS исключения, пропускаем
                }
            }
        } catch (e) {
            console.warn('TweakPanel: не удалось прочитать styleSheets', e);
        }

        // Также проверим вычисленные стили на :root на случай динамически добавленных
        const computed = getComputedStyle(document.documentElement);
        // Попробуем пройти по всем уже найденным или хотя бы стандартным паттернам
        return variables;
    }

    // Определение типа переменной и ее параметров
    function classifyVariable(name, value) {
        const lowerVal = value.toLowerCase();
        // Цвет: #hex, rgb, rgba, hsl, hsla, oklch или слова (если это цвет, например white/black/transparent)
        if (lowerVal.startsWith('#') || lowerVal.startsWith('rgb') || lowerVal.startsWith('hsl') || lowerVal.startsWith('oklch') || ['transparent', 'currentColor', 'inherit', 'initial'].includes(lowerVal)) {
            return { type: 'color', value };
        }
        
        // Проверка на длину/размер с единицами
        const lenMatch = value.match(/^(-?[\d.]+)(px|rem|em|%|vw|vh|ch)$/);
        if (lenMatch) {
            const num = parseFloat(lenMatch[1]);
            const unit = lenMatch[2];
            return { type: 'length', number: num, unit: unit, raw: value };
        }

        // Число без единиц или с другими специфичными значениями
        if (/^-?[\d.]+$/.test(value)) {
            return { type: 'number', value: parseFloat(value) };
        }

        // Шрифты
        // --font-display, --font-body, --font-family-*: по имени; иначе по значению вида "'Onest', sans-serif"
        const fontByValue = /(^|,)\s*(serif|sans-serif|monospace|cursive|system-ui)\s*$/i.test(value) || /^["'][^"']+["']/.test(value);
        if (/^--(font|ff)\b/.test(name) && !/size|weight|leading|tracking/.test(name) || fontByValue) {
            return { type: 'font', value };
        }

        return { type: 'text', value };
    }

    // Создаем контейнер для панели в Shadow DOM
    const host = document.createElement('div');
    host.id = 'nurtech-tweak-panel-host';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    // Стили Shadow DOM
    const style = document.createElement('style');
    style.textContent = `
        :host {
            all: initial;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 13px;
            color: #e2e8f0;
            box-sizing: border-box;
            z-index: 2147483000;
            position: fixed;
            bottom: 20px;
            right: 20px;
        }
        * { box-sizing: border-box; }
        .panel {
            position: absolute;
            bottom: 0;
            right: 0;
            width: 320px;
            max-height: 80vh;
            background: rgba(15, 23, 42, 0.9);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 12px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transition: transform 0.2s ease, opacity 0.2s ease;
            transform-origin: bottom right;
        }
        .panel.closed {
            transform: scale(0.95);
            opacity: 0;
            pointer-events: none;
            visibility: hidden;
        }
        .header {
            padding: 12px 16px;
            background: rgba(30, 41, 59, 0.7);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-weight: 600;
            letter-spacing: 0.01em;
            color: #f8fafc;
        }
        .header-title {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .close-btn {
            background: none;
            border: none;
            color: #94a3b8;
            cursor: pointer;
            font-size: 16px;
            padding: 4px;
            line-height: 1;
            border-radius: 4px;
        }
        .close-btn:hover {
            color: #f8fafc;
            background: rgba(255, 255, 255, 0.1);
        }
        .content {
            padding: 12px 16px;
            overflow-y: auto;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .footer {
            padding: 10px 16px;
            background: rgba(30, 41, 59, 0.7);
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            gap: 8px;
        }
        .btn {
            flex: 1;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 6px;
            padding: 8px 12px;
            font-weight: 500;
            font-size: 12px;
            cursor: pointer;
            transition: background 0.15s ease;
            text-align: center;
        }
        .btn:hover { background: #2563eb; }
        .btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            color: #cbd5e1;
        }
        .btn-secondary:hover { background: rgba(255, 255, 255, 0.18); color: white; }
        
        .toggle-trigger {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #1e293b;
            color: #f8fafc;
            border: 1px solid rgba(255, 255, 255, 0.2);
            width: 44px;
            height: 44px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-size: 18px;
            transition: transform 0.15s ease, background 0.15s ease;
            z-index: 2147483001;
        }
        .toggle-trigger:hover {
            transform: scale(1.05);
            background: #334155;
        }

        .group {
            flex-shrink: 0; /* иначе в колонке с прокруткой группы сжимаются и обрезаются */
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.02);
            overflow: hidden;
        }
        .group-header {
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.04);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-weight: 500;
            font-size: 12px;
            color: #cbd5e1;
            user-select: none;
        }
        .group-header:hover {
            background: rgba(255, 255, 255, 0.08);
            color: white;
        }
        .group-arrow {
            transition: transform 0.2s ease;
            font-size: 10px;
        }
        .group.collapsed .group-arrow {
            transform: rotate(-90deg);
        }
        .group-body {
            padding: 10px 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            border-top: 1px solid rgba(255, 255, 255, 0.04);
        }
        .group.collapsed .group-body {
            display: none;
        }

        .control-row {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .control-label {
            font-size: 11px;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
            word-break: break-all;
        }
        .control-inputs {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        input[type="color"] {
            -webkit-appearance: none;
            border: none;
            width: 28px;
            height: 28px;
            border-radius: 4px;
            cursor: pointer;
            background: none;
            padding: 0;
        }
        input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
        input[type="color"]::-webkit-color-swatch { border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 4px; }
        
        input[type="text"], input[type="number"], select {
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: #f8fafc;
            padding: 5px 8px;
            border-radius: 4px;
            font-size: 12px;
            flex: 1;
            outline: none;
        }
        input[type="text"]:focus, input[type="number"]:focus, select:focus {
            border-color: #3b82f6;
        }
        input[type="range"] {
            flex: 1;
            accent-color: #3b82f6;
            cursor: pointer;
        }
        select {
            cursor: pointer;
        }
        
        .variants-section {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 4px;
        }
        .variant-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        .variant-btn {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: #cbd5e1;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
        }
        .variant-btn.active {
            background: #3b82f6;
            border-color: #3b82f6;
            color: white;
            font-weight: 500;
        }

        @media (max-width: 500px) {
            :host {
                bottom: 0;
                right: 0;
                left: 0;
            }
            .panel {
                width: 100%;
                max-height: 85vh;
                border-bottom-left-radius: 0;
                border-bottom-right-radius: 0;
            }
            .toggle-trigger {
                bottom: 12px;
                right: 12px;
            }
        }
    `;

    // Создаем элементы интерфейса
    const container = document.createElement('div');
    container.innerHTML = `
        <button class="toggle-trigger" title="Панель твиков (активировать клавишей \` или ?tweaks)">⚙</button>
        <div class="panel closed">
            <div class="header">
                <div class="header-title"><span>Панель твиков сайта</span></div>
                <button class="close-btn" title="Закрыть">✕</button>
            </div>
            <div class="content" id="tweak-content">
                <!-- Сюда динамически добавятся группы вариантов и CSS-переменных -->
            </div>
            <div class="footer">
                <button class="btn btn-secondary" id="reset-btn">Сбросить</button>
                <button class="btn" id="copy-btn">Скопировать CSS</button>
            </div>
        </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(container);

    const panelEl = shadow.querySelector('.panel');
    const triggerEl = shadow.querySelector('.toggle-trigger');
    const closeEl = shadow.querySelector('.close-btn');
    const contentEl = shadow.querySelector('#tweak-content');
    const resetBtn = shadow.querySelector('#reset-btn');
    const copyBtn = shadow.querySelector('#copy-btn');

    // Переключение видимости панели
    function togglePanel() {
        const closed = panelEl.classList.toggle('closed');
        // Пока панель открыта, круглая кнопка не нужна: она закрывала «Скопировать CSS».
        triggerEl.style.display = closed ? '' : 'none';
    }

    triggerEl.addEventListener('click', togglePanel);
    closeEl.addEventListener('click', togglePanel);

    // Горячая клавиша «`» (backquote)
    window.addEventListener('keydown', (e) => {
        if (e.key === '`' || e.key === '~') {
            // Если фокус в инпуте или textarea, возможно не стоит перехватывать, но для удобства твика можно или проверять target
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
            e.preventDefault();
            togglePanel();
        }
    });

    // Хранение измененных переменных для экспорта CSS
    const modifiedVars = new Map();

    // Загрузка сохраненного состояния из localStorage
    let savedState = {};
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw) savedState = JSON.parse(raw);
    } catch (e) {}

    // Функция применения значения переменной
    function applyVariable(name, value) {
        document.documentElement.style.setProperty(name, value);
        modifiedVars.set(name, value);
        try {
            savedState[name] = value;
            localStorage.setItem(storageKey, JSON.stringify(savedState));
        } catch (e) {}
    }

    // Обработка вариантов [data-variant-group]
    function initVariantGroups() {
        const groups = document.querySelectorAll('[data-variant-group]');
        if (groups.length === 0) return;

        const section = document.createElement('div');
        section.className = 'group';
        
        let groupsHtml = `
            <div class="group-header"><span>Варианты блоков [data-variant-group]</span><span class="group-arrow">▼</span></div>
            <div class="group-body">
        `;

        groups.forEach((groupEl, groupIdx) => {
            const variants = groupEl.querySelectorAll('[data-variant]');
            if (variants.length === 0) return;

            // Восстановим сохраненный вариант или первый
            const savedVariant = savedState['__variant_' + groupIdx] || variants[0].getAttribute('data-variant');

            variants.forEach(v => {
                const vName = v.getAttribute('data-variant');
                if (vName === savedVariant) {
                    v.style.display = '';
                } else {
                    v.style.display = 'none';
                }
            });

            groupsHtml += `<div class="variants-section"><div class="control-label">Группа ${groupIdx + 1}</div><div class="variant-buttons">`;
            variants.forEach(v => {
                const vName = v.getAttribute('data-variant');
                const isActive = vName === savedVariant;
                groupsHtml += `<button class="variant-btn ${isActive ? 'active' : ''}" data-group="${groupIdx}" data-variant="${vName}">${vName}</button>`;
            });
            groupsHtml += `</div></div>`;
        });

        groupsHtml += `</div>`;
        section.innerHTML = groupsHtml;

        // Обработка сворачивания группы
        const header = section.querySelector('.group-header');
        header.addEventListener('click', () => section.classList.toggle('collapsed'));

        // Обработка кликов по вариантам
        section.querySelectorAll('.variant-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const gIdx = parseInt(e.target.getAttribute('data-group'), 10);
                const targetVariant = e.target.getAttribute('data-variant');
                
                // Активные кнопки в группе
                section.querySelectorAll(`.variant-btn[data-group="${gIdx}"]`).forEach(b => {
                    b.classList.toggle('active', b.getAttribute('data-variant') === targetVariant);
                });

                // Переключение видимости в DOM
                const groupEl = document.querySelectorAll('[data-variant-group][data-variant-group], [data-variant-group]')[gIdx] || document.querySelectorAll('[data-variant-group]')[gIdx];
                if (groupEl) {
                    groupEl.querySelectorAll('[data-variant]').forEach(v => {
                        v.style.display = v.getAttribute('data-variant') === targetVariant ? '' : 'none';
                    });
                }

                savedState['__variant_' + gIdx] = targetVariant;
                try {
                    localStorage.setItem(storageKey, JSON.stringify(savedState));
                } catch (e) {}
            });
        });

        contentEl.appendChild(section);
    }

    initVariantGroups();

    // Сбор переменных и построение контролов
    const variables = getRootVariables();
    
    // Если на странице нет переменных в stylesheets, попробуем поискать через getComputedStyle
    if (variables.size === 0) {
        const computed = getComputedStyle(document.documentElement);
        // Пробежимся по известным стандартным именам или тем, что есть в computedStyle (если поддерживается перебор, но в CSSStyleDeclaration перебор идет по индексам)
        for (let i = 0; i < computed.length; i++) {
            const prop = computed[i];
            if (prop.startsWith('--')) {
                const val = computed.getPropertyValue(prop).trim();
                if (val) variables.set(prop, val);
            }
        }
    }

    // Если всё равно пусто, создадим демо-набор для удобства или оставим пустым
    if (variables.size === 0) {
        // Добавим демо-переменные в память для отображения панели
        const defaultDemo = {
            '--color-bg': '#0f172a',
            '--color-text': '#f8fafc',
            '--color-accent': '#3b82f6',
            '--font-body': 'Manrope',
            '--space-section': '64px',
            '--radius': '12px'
        };
        for (const [k, v] of Object.entries(defaultDemo)) {
            variables.set(k, v);
        }
    }

    // Группировка переменных
    const categories = {
        'color': { title: 'Цвета (--color-*)', items: [] },
        'font': { title: 'Шрифты (--font-*)', items: [] },
        'space': { title: 'Отступы (--space-*)', items: [] },
        'radius': { title: 'Скругления (--radius-*)', items: [] },
        'other': { title: 'Прочее', items: [] }
    };

    variables.forEach((val, name) => {
        // Применим сохраненное значение, если оно есть
        if (savedState[name] !== undefined) {
            val = savedState[name];
            document.documentElement.style.setProperty(name, val);
            modifiedVars.set(name, val);
        }

        const classified = classifyVariable(name, val);
        
        let catKey = 'other';
        if (name.includes('color') || classified.type === 'color') catKey = 'color';
        else if (name.includes('font') || name.includes('typography') || classified.type === 'font') catKey = 'font';
        else if (name.includes('space') || name.includes('gap') || name.includes('padding') || name.includes('margin')) catKey = 'space';
        else if (name.includes('radius') || name.includes('round')) catKey = 'radius';

        categories[catKey].items.push({ name, val, classified });
    });

    // Рендер групп и контролов
    for (const [catKey, catObj] of Object.entries(categories)) {
        if (catObj.items.length === 0) continue;

        const groupEl = document.createElement('div');
        groupEl.className = 'group' + (catKey === 'other' ? ' collapsed' : '');
        
        let groupHtml = `
            <div class="group-header"><span>${catObj.title}</span><span class="group-arrow">▼</span></div>
            <div class="group-body">
        `;

        catObj.items.forEach(item => {
            const { name, val, classified } = item;
            groupHtml += `<div class="control-row" data-var="${name}">`;
            groupHtml += `<div class="control-label"><span>${name}</span><span class="val-preview">${val}</span></div>`;
            groupHtml += `<div class="control-inputs">`;

            if (classified.type === 'color') {
                // Цвет -> <input type=color> + текстовое поле
                let hexVal = val;
                if (!val.startsWith('#')) {
                    // Попытка привести к hex или оставить как есть
                    hexVal = '#3b82f6';
                }
                groupHtml += `
                    <input type="color" class="inp-color" value="${hexVal.length === 7 ? hexVal : '#3b82f6'}">
                    <input type="text" class="inp-text" value="${val}">
                `;
            } else if (classified.type === 'length') {
                // Длина -> ползунок + числовое поле
                const num = classified.number;
                const unit = classified.unit;
                const maxVal = num * 4 > 10 ? num * 4 : 100;
                const step = ['rem', 'em'].includes(unit) ? 0.01 : 1;
                groupHtml += `
                    <input type="range" class="inp-range" min="0" max="${maxVal}" step="${step}" value="${num}">
                    <input type="number" class="inp-num" step="${step}" value="${num}">
                    <span style="font-size:11px; color:#94a3b8; width:24px;">${unit}</span>
                `;
            } else if (classified.type === 'number') {
                // Число без единиц
                const num = classified.value;
                const isFontWeight = name.includes('weight') || name.includes('fw');
                const min = isFontWeight ? 100 : 0;
                const max = isFontWeight ? 900 : (num * 4 > 1 ? num * 4 : 10);
                const step = isFontWeight ? 100 : 0.05;
                groupHtml += `
                    <input type="range" class="inp-range" min="${min}" max="${max}" step="${step}" value="${num}">
                    <input type="number" class="inp-num" step="${step}" value="${num}">
                `;
            } else if (classified.type === 'font') {
                // font-family -> <select>
                groupHtml += `<select class="inp-select">`;
                fontsList.forEach(f => {
                    const selected = val.toLowerCase().includes(f.toLowerCase()) ? 'selected' : '';
                    groupHtml += `<option value="${f}" ${selected}>${f}</option>`;
                });
                groupHtml += `</select>`;
                groupHtml += `<input type="text" class="inp-text" value="${val}" style="display:none;">`;
            } else {
                // Прочее -> текстовое поле
                groupHtml += `<input type="text" class="inp-text" value="${val}">`;
            }

            groupHtml += `</div></div>`;
        });

        groupHtml += `</div>`;
        groupEl.innerHTML = groupHtml;

        // Сворачивание группы
        groupEl.querySelector('.group-header').addEventListener('click', () => {
            groupEl.classList.toggle('collapsed');
        });

        // Интерактив контролов
        catObj.items.forEach(item => {
            const { name, classified } = item;
            const row = groupEl.querySelector(`[data-var="${name}"]`);
            if (!row) return;

            const previewEl = row.querySelector('.val-preview');

            if (classified.type === 'color') {
                const colorInput = row.querySelector('.inp-color');
                const textInput = row.querySelector('.inp-text');

                colorInput.addEventListener('input', () => {
                    const v = colorInput.value;
                    textInput.value = v;
                    previewEl.textContent = v;
                    applyVariable(name, v);
                });
                textInput.addEventListener('input', () => {
                    const v = textInput.value;
                    previewEl.textContent = v;
                    applyVariable(name, v);
                    if (v.startsWith('#') && v.length === 7) {
                        colorInput.value = v;
                    }
                });
            } else if (classified.type === 'length') {
                const rangeInput = row.querySelector('.inp-range');
                const numInput = row.querySelector('.inp-num');
                const unit = classified.unit;

                const updateVal = (num) => {
                    const fullVal = num + unit;
                    rangeInput.value = num;
                    numInput.value = num;
                    previewEl.textContent = fullVal;
                    applyVariable(name, fullVal);
                };

                rangeInput.addEventListener('input', () => updateVal(rangeInput.value));
                numInput.addEventListener('input', () => updateVal(numInput.value));
            } else if (classified.type === 'number') {
                const rangeInput = row.querySelector('.inp-range');
                const numInput = row.querySelector('.inp-num');

                const updateVal = (num) => {
                    rangeInput.value = num;
                    numInput.value = num;
                    previewEl.textContent = num;
                    applyVariable(name, num);
                };

                rangeInput.addEventListener('input', () => updateVal(rangeInput.value));
                numInput.addEventListener('input', () => updateVal(numInput.value));
            } else if (classified.type === 'font') {
                const selectEl = row.querySelector('.inp-select');
                const textInput = row.querySelector('.inp-text');

                selectEl.addEventListener('change', () => {
                    const font = selectEl.value;
                    loadFont(font);
                    const fullVal = font === 'Использовать исходный' ? 'inherit' : '"' + font + '", sans-serif';
                    textInput.value = fullVal;
                    previewEl.textContent = fullVal;
                    applyVariable(name, fullVal);
                });
            } else {
                const textInput = row.querySelector('.inp-text');
                textInput.addEventListener('input', () => {
                    const v = textInput.value;
                    previewEl.textContent = v;
                    applyVariable(name, v);
                });
            }
        });

        contentEl.appendChild(groupEl);
    }

    // Кнопка Сбросить
    resetBtn.addEventListener('click', () => {
        try {
            localStorage.removeItem(storageKey);
        } catch (e) {}
        modifiedVars.clear();
        // Перезагрузка страницы для возврата к исходным стилям
        location.reload();
    });

    // Кнопка Скопировать CSS
    copyBtn.addEventListener('click', () => {
        if (modifiedVars.size === 0) {
            alert('Нет измененных переменных для копирования.');
            return;
        }

        let cssBlock = ':root {\n';
        modifiedVars.forEach((val, name) => {
            cssBlock += `    ${name}: ${val};\n`;
        });
        cssBlock += '}';

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(cssBlock).then(() => {
                const oldText = copyBtn.textContent;
                copyBtn.textContent = 'Скопировано!';
                setTimeout(() => copyBtn.textContent = oldText, 2000);
            }).catch(() => fallbackCopy(cssBlock));
        } else {
            fallbackCopy(cssBlock);
        }
    });

    function fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
            document.execCommand('copy');
            alert('CSS скопирован в буфер обмена!');
        } catch (e) {
            alert('Не удалось скопировать CSS.');
        }
        document.body.removeChild(textarea);
    }

})();
