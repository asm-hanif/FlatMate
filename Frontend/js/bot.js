// FlatMate AI Assistant — floating chat widget
// Talks to /api/bot/* to (a) suggest a fair price to property owners and
// (b) recommend matching active listings to anyone searching for a flat.
// Self-contained: injects its own DOM, doesn't depend on other page scripts.

(function () {
    'use strict';

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatBDT(amount) {
        const n = Math.round(Number(amount) || 0);
        return '৳' + n.toLocaleString('en-US');
    }

    /* ============================================================
       INJECT WIDGET DOM
    ============================================================ */

    function buildWidget() {
        if (document.getElementById('fm-bot-launcher')) return; // already injected

        const launcher = document.createElement('button');
        launcher.id = 'fm-bot-launcher';
        launcher.type = 'button';
        launcher.setAttribute('aria-label', 'Open FlatMate AI Assistant');
        launcher.innerHTML = '<i class="fas fa-comment-dots"></i><span class="fm-bot-badge"></span>';

        const panel = document.createElement('div');
        panel.id = 'fm-bot-panel';
        panel.innerHTML = `
            <div class="fm-bot-header">
                <div class="fm-bot-header-title">
                    <span class="fm-bot-avatar"><i class="fas fa-robot"></i><span class="fm-bot-online-dot"></span></span>
                    <div>
                        Mira <span style="font-weight:500; opacity:0.75; font-size:12px;">· FlatMate AI</span>
                        <div class="fm-bot-header-sub">Always here to help &amp; chat</div>
                    </div>
                </div>
                <button class="fm-bot-close" type="button" aria-label="Close">&times;</button>
            </div>
            <div class="fm-bot-body" id="fm-bot-body"></div>
            <form class="fm-bot-footer" id="fm-bot-form">
                <input type="text" id="fm-bot-input" placeholder="Type a message..." autocomplete="off" />
                <button type="submit" aria-label="Send"><i class="fas fa-paper-plane"></i></button>
            </form>
        `;

        document.body.appendChild(launcher);
        document.body.appendChild(panel);

        launcher.addEventListener('click', togglePanel);
        panel.querySelector('.fm-bot-close').addEventListener('click', togglePanel);

        const form = panel.querySelector('#fm-bot-form');
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            const input = document.getElementById('fm-bot-input');
            const value = input.value.trim();
            if (!value) return;
            input.value = '';
            handleFreeTextInput(value);
        });
    }

    let opened = false;
    let greeted = false;

    function togglePanel() {
        const panel = document.getElementById('fm-bot-panel');
        opened = !opened;
        panel.classList.toggle('fm-bot-open', opened);
        if (opened && !greeted) {
            greeted = true;
            initConversation();
        }
        if (opened) {
            document.getElementById('fm-bot-input').focus();
        }
    }


    /* ============================================================
       CONVERSATION LOG HELPERS
    ============================================================ */

    function getBody() {
        return document.getElementById('fm-bot-body');
    }

    function scrollToBottom() {
        const body = getBody();
        body.scrollTop = body.scrollHeight;
    }

    function addBotMessage(text) {
        const el = document.createElement('div');
        el.className = 'fm-bot-msg fm-bot-msg-bot';
        el.textContent = text;
        getBody().appendChild(el);
        scrollToBottom();
    }

    function addUserMessage(text) {
        const el = document.createElement('div');
        el.className = 'fm-bot-msg fm-bot-msg-user';
        el.textContent = text;
        getBody().appendChild(el);
        scrollToBottom();
    }

    function addErrorMessage(text) {
        const el = document.createElement('div');
        el.className = 'fm-bot-error';
        el.textContent = text;
        getBody().appendChild(el);
        scrollToBottom();
    }

    let typingEl = null;

    function showTyping() {
        typingEl = document.createElement('div');
        typingEl.className = 'fm-bot-typing';
        typingEl.innerHTML = '<span></span><span></span><span></span>';
        getBody().appendChild(typingEl);
        scrollToBottom();
    }

    function hideTyping() {
        if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
        typingEl = null;
    }

    function withTypingDelay(callback, ms) {
        showTyping();
        setTimeout(() => {
            hideTyping();
            callback();
        }, ms || 380);
    }

    function clearChips() {
        getBody().querySelectorAll('.fm-bot-chips').forEach(el => el.remove());
    }

    function addChips(options, onPick) {
        clearChips();
        const wrap = document.createElement('div');
        wrap.className = 'fm-bot-chips';
        options.forEach(opt => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'fm-bot-chip' + (opt.ghost ? ' fm-bot-chip-ghost' : '');
            chip.textContent = opt.label;
            chip.addEventListener('click', () => {
                clearChips();
                onPick(opt);
            });
            wrap.appendChild(chip);
        });
        getBody().appendChild(wrap);
        scrollToBottom();
    }

    function addMultiChips(options, onDone) {
        clearChips();
        const selected = new Set();
        const wrap = document.createElement('div');
        wrap.className = 'fm-bot-chips';

        options.forEach(opt => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'fm-bot-chip';
            chip.textContent = opt.label;
            chip.addEventListener('click', () => {
                if (selected.has(opt.value)) {
                    selected.delete(opt.value);
                    chip.style.background = '';
                    chip.style.color = '';
                } else {
                    selected.add(opt.value);
                    chip.style.background = 'var(--color-primary, #252824)';
                    chip.style.color = '#fff';
                }
            });
            wrap.appendChild(chip);
        });

        const doneChip = document.createElement('button');
        doneChip.type = 'button';
        doneChip.className = 'fm-bot-chip fm-bot-chip-ghost';
        doneChip.textContent = 'None / Continue →';
        doneChip.addEventListener('click', () => {
            clearChips();
            onDone(Array.from(selected));
        });
        wrap.appendChild(doneChip);

        getBody().appendChild(wrap);
        scrollToBottom();
    }

    function addCard(html) {
        const el = document.createElement('div');
        el.className = 'fm-bot-card';
        el.innerHTML = html;
        getBody().appendChild(el);
        scrollToBottom();
    }


    /* ============================================================
       SESSION + META
    ============================================================ */

    let session = { authenticated: false, user: null };
    let meta = null;

    async function loadSession() {
        try {
            const res = await fetch('/api/auth/session');
            const data = await res.json();
            session = data;
        } catch (_) {
            session = { authenticated: false, user: null };
        }
    }

    async function loadMeta() {
        if (meta) return meta;
        try {
            const res = await fetch('/api/bot/meta');
            meta = await res.json();
        } catch (_) {
            meta = null;
        }
        return meta;
    }


    /* ============================================================
       MAIN MENU
    ============================================================ */

    async function initConversation() {
        await loadSession();
        await loadMeta();
        showMainMenu(true);
    }

    function showMainMenu(isGreeting) {
        state.flow = null;

        if (!session.authenticated) {
            if (isGreeting) {
                addBotMessage("Hey there! I'm Mira, your FlatMate assistant 👋 I can suggest a fair price for a property, help you find flats that match what you're looking for, or just chat. Sign in first so I know whether you're an owner or a home seeker.");
            }
            addChips([
                { label: '🔐 Sign In', action: () => { window.location.href = '/login.html'; } },
                { label: '📝 Join FlatMate', action: () => { window.location.href = '/register.html'; } }
            ], (opt) => opt.action());
            return;
        }

        const role = session.user && session.user.role;

        if (isGreeting) {
            addBotMessage(
                ['Owner','Both'].includes(role)
                    ? `Hey ${session.user.name || ''}! I'm Mira. I can suggest a fair rent/sale price for your property, help you find flats yourself, or just chat if you're bored. What's up?`
                    : `Hey ${session.user.name || ''}! I'm Mira 🙂 Tell me what you're looking for and I'll suggest matching flats from FlatMate's active listings — or we can just chat. What's up?`
            );
        }

        const options = [];
        if (['Owner','Both'].includes(role)) {
            options.push({ label: '💰 Suggest a price for my property', action: () => startPriceFlow() });
        }
        options.push({ label: '🔍 Find flats matching my criteria', action: () => startFindFlow() });

        addChips(options, (opt) => opt.action());
    }


    /* ============================================================
       GENERIC STEP ENGINE
    ============================================================ */

    const state = {
        flow: null,        // 'price' | 'find'
        stepIndex: 0,
        slots: {},
        llmHistory: []
    };

    function currentSteps() {
        return state.flow === 'price' ? priceSteps() : state.flow === 'find' ? findSteps() : [];
    }

    function goToStep(index) {
        state.stepIndex = index;
        const steps = currentSteps();
        if (state.stepIndex >= steps.length) {
            runFlowSubmit();
            return;
        }
        renderStep(steps[state.stepIndex]);
    }

    function renderStep(step) {
        withTypingDelay(() => {
            addBotMessage(step.ask(state.slots));

            if (step.type === 'chips') {
                const opts = step.options(state.slots).map(o => ({ label: o.label, value: o.value }));
                addChips(opts, (opt) => acceptStepValue(step, opt.value, opt.label));
            } else if (step.type === 'multi') {
                const opts = step.options(state.slots);
                addMultiChips(opts, (values) => acceptStepValue(step, values, values.length ? `${values.length} amenities selected` : 'None'));
            }
            // 'text' / 'number' steps just wait for the footer input.
        });
    }

    function acceptStepValue(step, value, displayLabel) {
        state.slots[step.key] = value;
        addUserMessage(displayLabel);
        goToStep(state.stepIndex + 1);
    }

    function handleFreeTextInput(rawText) {
        const steps = currentSteps();
        const step = steps[state.stepIndex];

        // No active flow: treat as an intent, or restart the menu.
        if (!step) {
            addUserMessage(rawText);
            handleIdleIntent(rawText);
            return;
        }

        addUserMessage(rawText);

        if (step.type === 'chips') {
            // Try to match free-typed text against one of the chip labels/values.
            const opts = step.options(state.slots);
            const match = opts.find(o =>
                o.label.toLowerCase() === rawText.toLowerCase() ||
                String(o.value).toLowerCase() === rawText.toLowerCase() ||
                o.label.toLowerCase().includes(rawText.toLowerCase())
            );
            if (match) {
                clearChips();
                state.slots[step.key] = match.value;
                goToStep(state.stepIndex + 1);
            } else {
                withTypingDelay(() => addBotMessage('Please tap one of the options above 👆'), 250);
            }
            return;
        }

        if (step.type === 'multi') {
            withTypingDelay(() => addBotMessage('Please tap the amenities above, then "Continue" 👆'), 250);
            return;
        }

        // text / number
        const parsed = step.parse ? step.parse(rawText) : rawText;
        const error = step.validate ? step.validate(parsed, state.slots) : null;
        if (error) {
            withTypingDelay(() => addBotMessage(error), 250);
            return;
        }
        clearChips();
        state.slots[step.key] = parsed;
        goToStep(state.stepIndex + 1);
    }

    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    /* Chit-chat library — checked in order; first pattern match wins.
       Keeps Mira feeling like a friendly presence rather than a rigid
       menu system, while still nudging (gently, not every time) toward
       the two real features she can act on. */
    const CHITCHAT_RULES = [
        {
            pattern: /\b(hi|hello|hey|salaam|assalamualaikum|good morning|good afternoon|good evening|yo)\b/,
            replies: [
                "Hey! 👋 Good to see you.",
                "Hi there! How's it going?",
                "Hello! What's on your mind today?"
            ]
        },
        {
            pattern: /how are you|how('?s| is) it going|how('?s| have) you been|kemon acho/,
            replies: [
                "I'm doing great, thanks for asking! Just here helping people find great flats and fair prices. How about you?",
                "Can't complain — running smoothly and ready to help! How's your day going?",
                "I'm good! Somewhere between 'excited to help' and 'wondering if AIs get tired.' How are you doing?"
            ]
        },
        {
            pattern: /^(i'?m|im|doing|feeling)?\s*(good|great|fine|okay|ok|alright|not bad|well|awesome|amazing)\.?!?$/,
            replies: [
                "Glad to hear it! 😊 Anything I can help you with today?",
                "Nice! Let me know if you want a price check or a flat search whenever you're ready.",
                "Good to hear! I'm around whenever you need me."
            ]
        },
        {
            pattern: /^(i'?m|im|feeling)?\s*(bad|sad|tired|stressed|exhausted|not (good|great)|down|terrible|awful)\.?!?$/,
            replies: [
                "Sorry to hear that. Hope things get better soon. I'm here if a distraction (or a flat search) would help.",
                "Ah, that's rough. Take it easy on yourself. Let me know if there's anything I can do to make your day a little easier.",
                "Sorry you're feeling that way. Sometimes house-hunting is oddly therapeutic — happy to help if you're up for it."
            ]
        },
        {
            pattern: /thank(s| you)|thx|appreciate it|cheers/,
            replies: [
                "You're welcome! 😊",
                "Anytime! That's what I'm here for.",
                "Happy to help! Let me know if you need anything else."
            ]
        },
        {
            pattern: /\b(lol|lmao|haha+|hehe+|rofl)\b/,
            replies: [
                "Glad I could bring a smile 😄",
                "Haha, glad that landed!",
                "😄 Anyway, let me know if you want help with anything."
            ]
        },
        {
            pattern: /joke|make me laugh|tell me something funny/,
            replies: [
                "Why did the flat get rejected by the bank? It had too many 'issues' in the foundation. 😄",
                "What did the tenant say to the landlord who kept raising the rent? 'At this rate, I'll own the place before you do.'",
                "Why don't apartments ever get lonely? They always have a few flatmates. 😅"
            ]
        },
        {
            pattern: /who are you|what are you|your name|what('?s| is) your name/,
            replies: [
                "I'm Mira, FlatMate's AI assistant. I can chat naturally when a language model is available, and I always keep my property-price workflow tied to FlatMate's valuation model.",
                "I'm Mira! Think of me as FlatMate's front-desk assistant — I can suggest fair prices, help you find flats, and chat when you just want to talk."
            ]
        },
        {
            pattern: /are you (a )?(real )?(human|person|bot|ai|robot)|are you real/,
            replies: [
                "I'm an AI built into FlatMate — not human, but I try to be genuinely helpful (and friendly)!",
                "I'm a bot, yes — but hopefully a pleasant one to talk to."
            ]
        },
        {
            pattern: /what can you do|help me|your (features|capabilities)|what do you do/,
            replies: null // handled specially below (shows the menu)
        },
        {
            pattern: /\b(bye|goodbye|see you|see ya|later|good night)\b/,
            replies: [
                "See you later! Come back anytime you want a price check or a flat search. 👋",
                "Bye for now! I'll be right here whenever you need me.",
                "Take care! 👋"
            ]
        },
        {
            pattern: /weather/,
            replies: [
                "I don't have a weather forecast for you, but I can tell you which neighbourhoods in Dhaka or Chattogram have the best flats if that helps! 😄"
            ]
        },
        {
            pattern: /\b(stupid|dumb|useless|hate you|you suck|bad bot)\b/,
            replies: [
                "Sorry I'm not hitting the mark — let me know what went wrong and I'll try to do better.",
                "Fair feedback. If something specific isn't working, tell me and I'll try to help properly."
            ]
        },
        {
            pattern: /\b(love you|you'?re (great|awesome|amazing|the best|so helpful|nice|cool))\b/,
            replies: [
                "Aw, thank you! That made my day. 😊",
                "That's so kind of you to say — thank you!",
                "You're pretty great yourself. Thanks! 😊"
            ]
        }
    ];

    function tryChitChat(lower) {
        for (const rule of CHITCHAT_RULES) {
            if (rule.pattern.test(lower) && rule.replies) {
                return pickRandom(rule.replies);
            }
        }
        return null;
    }

    async function askLLM(text) {
        state.llmHistory.push({ role: 'user', content: text });
        try {
            const res = await fetch('/api/bot/chat', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: state.llmHistory.slice(-12) })
            });
            const data = await res.json();
            if (data && data.message) {
                state.llmHistory.push({ role: 'assistant', content: data.message });
                addBotMessage(data.message);
                return true;
            }
        } catch (_) {
            // Deterministic fallback below keeps Mira available even without
            // an external LLM or when the provider is temporarily unavailable.
        }
        return false;
    }

    function handleIdleIntent(text) {
        const lower = text.toLowerCase().trim();
        const role = session.authenticated && session.user && session.user.role;

        if (!session.authenticated) {
            showMainMenu(false);
            return;
        }

        // Price / find intents take priority over chit-chat since they're
        // unambiguous requests for a real feature.
        if (/price|value|worth|rent.*(much|amount)|how much/.test(lower)) {
            if (['Owner','Both'].includes(role)) {
                startPriceFlow();
            } else {
                withTypingDelay(() => {
                    addBotMessage("Price suggestions are available to property owners for their own listings. As a home seeker, I can help you find flats that fit your budget instead!");
                    addChips([{ label: '🔍 Find flats for me', action: () => startFindFlow() }], (o) => o.action());
                });
            }
            return;
        }

        if (/find (me )?a?\s*flat|search|apartment|looking for a (flat|place|home)|budget/.test(lower)) {
            startFindFlow();
            return;
        }

        if (/menu|start over|restart|main menu/.test(lower)) {
            withTypingDelay(() => showMainMenu(false));
            return;
        }

        if (/what can you do|help me|your (features|capabilities)|what do you do/.test(lower)) {
            withTypingDelay(() => {
                addBotMessage("I can do a few things: suggest a fair price for a property, find flats matching your criteria, or just chat if you want company. What sounds good?");
                showMainMenu(false);
            });
            return;
        }

        // General chit-chat
        const chitChatReply = tryChitChat(lower);
        if (chitChatReply) {
            withTypingDelay(() => addBotMessage(chitChatReply), 300 + Math.random() * 300);
            return;
        }

        // Genuine fallback — friendly, not repetitive, and only occasionally
        // nudges back to the menu so it doesn't feel like a broken record.
        showTyping();
        askLLM(text).then(handled => {
            hideTyping();
            if (handled) return;
            const fallbacks = [
                "I'm not quite sure how to respond to that, but I'm listening! Want help with a price check or finding a flat?",
                "Hmm, I don't have a great answer for that one — I'm best with property prices and flat searches, but happy to keep chatting too.",
                "Not sure I follow, but no worries! Ask me about pricing a property, finding a flat, or just say hi."
            ];
            addBotMessage(pickRandom(fallbacks));
        });
    }


    /* ============================================================
       FLOW: PRICE SUGGESTION (owner only)
    ============================================================ */

    function startPriceFlow() {
        state.flow = 'price';
        state.slots = {};
        withTypingDelay(() => goToStep(0));
    }

    function priceSteps() {
        const amenityOptions = () => (meta && meta.amenities ? meta.amenities : [
            'Parking', 'CoveredParking', 'Balconies', 'Lift', 'Security', 'CCTV', 'Guard',
            'Generator', 'Water', 'Gas', 'Electricity', 'Internet', 'CableTV',
            'AirConditioning', 'Heating', 'SwimmingPool', 'Gym', 'CommunityHall',
            'Rooftop', 'Garden', 'Playground', 'PetFriendly', 'Laundry',
            'MosquePrayerRoom', 'FireExit', 'WASAConnection', 'SelfWaterSupply',
            'HotWater', 'CylinderGas', 'TelephoneLine', 'Intercom', 'WifiConnectivity',
            'SecurityAlarmSystem', 'ElectronicSecurity', 'SolarPanels', 'GuestParking',
            'ServantQuarter', 'ServantToilet', 'FireProtection', 'DepartmentalStore'
        ]).map(a => ({
            label: a.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim(),
            value: a
        }));

        return [
            { key: 'purpose', ask: () => 'Let’s build the listing together. Is the property for rent or sale?', type: 'chips', options: () => [{ label: 'Rent', value: 'Rent' }, { label: 'Sale', value: 'Sale' }] },
            { key: 'title', ask: () => 'What would you like to call the property? You can give me a simple name, or type “auto” and I’ll create a professional title.', type: 'text', parse: v => v.trim(), validate: v => !v ? 'Please give the property a name or type “auto”.' : null },
            { key: 'city', ask: () => 'Which city is the property in?', type: 'text', parse: v => v.trim(), validate: v => !v ? 'Please enter the city.' : null },
            { key: 'areaName', ask: slots => `Which area or neighbourhood in ${slots.city}?`, type: 'text', parse: v => v.trim(), validate: v => !v ? 'Please enter the neighbourhood or area.' : null },
            { key: 'district', ask: () => 'Which district is it in?', type: 'text', parse: v => v.trim(), validate: v => !v ? 'Please enter the district.' : null },
            { key: 'address', ask: () => 'What is the property address? A short address is enough.', type: 'text', parse: v => v.trim(), validate: v => !v ? 'Please enter the property address.' : null },
            { key: 'propertyType', ask: () => 'What type of property is it?', type: 'chips', options: () => [
                'Apartment','Duplex','Penthouse','Studio','House','Villa','Office','Shop','Building','Other'
            ].map(v => ({ label: v, value: v })) },
            { key: 'constructionStatus', ask: () => 'What is the construction status?', type: 'chips', options: () => [{ label: 'Ready', value: 'Ready' }, { label: 'Under Construction', value: 'Under Construction' }] },
            { key: 'transactionType', ask: () => 'Is it a new property or resale?', type: 'chips', options: () => [{ label: 'New', value: 'New' }, { label: 'Resale', value: 'Resale' }] },
            { key: 'area', ask: () => 'What is the main property size?', type: 'text', parse: v => Number(String(v).replace(/[^\d.]/g, '')), validate: v => !v || v <= 0 ? 'Please enter a valid property size.' : null },
            { key: 'areaUnit', ask: () => 'What unit is that size in?', type: 'chips', options: () => ['sq ft','sq m','katha','decimal'].map(v => ({ label: v, value: v })) },
            { key: 'landArea', ask: () => 'Does the property have a separate land/plot size? Type 0 if not applicable.', type: 'text', parse: v => Number(String(v).replace(/[^\d.]/g, '')) || 0, validate: v => v < 0 ? 'Please enter 0 or a positive number.' : null },
            { key: 'landAreaUnit', ask: () => 'What unit is the land/plot size in?', type: 'chips', options: () => ['sq ft','sq m','katha','decimal'].map(v => ({ label: v, value: v })) },
            { key: 'bedrooms', ask: () => 'How many bedrooms?', type: 'text', parse: v => Number(String(v).replace(/[^\d.]/g, '')), validate: v => !Number.isFinite(v) || v < 0 ? 'Please enter the bedroom count.' : null },
            { key: 'bathrooms', ask: () => 'How many bathrooms?', type: 'text', parse: v => Number(String(v).replace(/[^\d.]/g, '')), validate: v => !Number.isFinite(v) || v < 0 ? 'Please enter the bathroom count.' : null },
            { key: 'livingRooms', ask: () => 'How many living rooms?', type: 'text', parse: v => Number(String(v).replace(/[^\d.]/g, '')) || 0, validate: v => v < 0 ? 'Please enter 0 or more.' : null },
            { key: 'diningRooms', ask: () => 'How many dining rooms?', type: 'text', parse: v => Number(String(v).replace(/[^\d.]/g, '')) || 0, validate: v => v < 0 ? 'Please enter 0 or more.' : null },
            { key: 'kitchen', ask: () => 'How many kitchens?', type: 'text', parse: v => Number(String(v).replace(/[^\d.]/g, '')) || 0, validate: v => v < 0 ? 'Please enter 0 or more.' : null },
            { key: 'servantRooms', ask: () => 'How many servant rooms?', type: 'text', parse: v => Number(String(v).replace(/[^\d.]/g, '')) || 0, validate: v => v < 0 ? 'Please enter 0 or more.' : null },
            { key: 'storeRooms', ask: () => 'How many store rooms?', type: 'text', parse: v => Number(String(v).replace(/[^\d.]/g, '')) || 0, validate: v => v < 0 ? 'Please enter 0 or more.' : null },
            { key: 'floor', ask: () => 'Which floor is the property on?', type: 'text', parse: v => Number(String(v).replace(/[^\d.]/g, '')) || 0, validate: v => v < 0 ? 'Please enter 0 or more.' : null },
            { key: 'totalFloors', ask: () => 'How many total floors does the building have?', type: 'text', parse: v => Number(String(v).replace(/[^\d.]/g, '')) || 0, validate: v => v < 0 ? 'Please enter 0 or more.' : null },
            { key: 'floorAvailableOn', ask: () => 'What should I put for “Floor Available On”? (Example: 3rd Floor, Any Floor)', type: 'text', parse: v => v.trim(), validate: v => !v ? 'Type a value, for example “Any Floor”.' : null },
            { key: 'furnished', ask: () => 'What is the furnishing status?', type: 'chips', options: () => ['Unfurnished','Semi-furnished','Fully furnished'].map(v => ({ label: v, value: v })) },
            { key: 'facing', ask: () => 'Which direction does the property face?', type: 'chips', options: () => ['', 'North','South','East','West','North-East','North-West','South-East','South-West'].map(v => ({ label: v || 'Not specified', value: v })) },
            { key: 'rentPeriod', ask: slots => slots.purpose === 'Rent' ? 'What is the rent period?' : 'Rent period is not needed for a sale. I’ll leave it blank.', type: 'chips', options: () => ['Monthly','Yearly','Negotiable'].map(v => ({ label: v, value: v })), showIf: slots => slots.purpose === 'Rent' },
            { key: 'securityDeposit', ask: () => 'Is there a security deposit? Enter 0 if none.', type: 'text', parse: v => Number(String(v).replace(/[^\d.]/g, '')) || 0, validate: v => v < 0 ? 'Please enter 0 or a positive amount.' : null, showIf: slots => slots.purpose === 'Rent' },
            { key: 'description', ask: () => 'Tell me anything important about the property. Type a short description, or “auto” and I’ll create one from the details.', type: 'text', parse: v => v.trim(), validate: v => !v ? 'Please type a description or “auto”.' : null },
            { key: 'amenities', ask: () => 'Now select every amenity the property actually has. I’ll use these details for the AI estimate and the listing form.', type: 'multi', options: amenityOptions },
            { key: 'latitude', ask: () => 'Do you have the property latitude? Type 0 if you do not know it.', type: 'text', parse: v => Number(String(v).replace(/[^\d.-]/g, '')) || 0, validate: v => Number.isFinite(v) ? null : 'Please enter a valid latitude or 0.' },
            { key: 'longitude', ask: () => 'Do you have the property longitude? Type 0 if you do not know it.', type: 'text', parse: v => Number(String(v).replace(/[^\d.-]/g, '')) || 0, validate: v => Number.isFinite(v) ? null : 'Please enter a valid longitude or 0.' }
        ].filter(step => !step.showIf || step.showIf(state.slots) !== false);
    }

    // Because the "other city" text step should only appear conditionally,
    // priceSteps()/findSteps() are re-evaluated with showIf every time we
    // advance, using state.slots as it stands *before* that step runs.
    // To keep the filtering correct we recompute steps fresh at each goToStep
    // call (see currentSteps()), which already re-invokes these functions.

    async function runFlowSubmit() {
        if (state.flow === 'price') return submitPriceFlow();
        if (state.flow === 'find') return submitFindFlow();
    }

    async function submitPriceFlow() {
        withTypingDelay(() => addBotMessage('Let me work out a fair price for that... 🧮'), 300);

        const slots = state.slots;
        const city = slots.city === '__other__' ? '' : slots.city;

        try {
            const res = await fetch('/api/bot/price-suggest', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...slots,
                    city,
                    amenities: slots.amenities || []
                })
            });
            const data = await res.json();

            setTimeout(() => {
                hideTyping();
                if (!res.ok || !data.success) {
                    addErrorMessage(data.error || 'Sorry, I could not generate a price suggestion right now.');
                    offerRestart();
                    return;
                }
                renderPriceResult(data.suggestion, data.comparables, slots, city);
            }, 500);

        } catch (err) {
            setTimeout(() => {
                hideTyping();
                addErrorMessage('Network error — please try again in a moment.');
                offerRestart();
            }, 400);
        }
    }

    function renderPriceResult(suggestion, comparables, slots, city) {
        const periodLabel = suggestion.period === 'per month' ? '/ month' : '(one-time)';

        let html = `
            <div class="fm-bot-card-title">💡 AI Suggested ${escapeHtml(suggestion.purpose)} Price</div>
            <div class="fm-bot-card-price">${formatBDT(suggestion.estimate)} <span style="font-size:12px;font-weight:500;color:#6b7280;">${periodLabel}</span></div>
            <div class="fm-bot-card-range">Estimated range: ${formatBDT(suggestion.low)} – ${formatBDT(suggestion.high)}</div>
            <div class="fm-bot-card-note">${escapeHtml(suggestion.explanation)}</div>
            ${suggestion.modelType ? `<div class="fm-bot-card-note" style="margin-top:8px;font-size:11px;opacity:.78;"><strong>Model:</strong> ${escapeHtml(suggestion.modelType)}${suggestion.modelAccuracy ? ` · ${escapeHtml(suggestion.modelAccuracy)}` : ''}</div>` : ''}
        `;

        if (comparables && comparables.length) {
            html += `<div class="fm-bot-card-note" style="margin-top:8px;"><strong>Similar active listings nearby:</strong></div>`;
            comparables.forEach(c => {
                html += `<div class="fm-bot-card-note">• ${escapeHtml(c.Title)} — ${formatBDT(c.Price)} (${c.Area ? c.Area + ' ' + c.AreaUnit : 'size n/a'})</div>`;
            });
        }

        addCard(html);

        const draft = { ...slots, city, Price: suggestion.estimate };
        if (String(draft.title || '').toLowerCase() === 'auto') {
            draft.title = `${draft.bedrooms || ''} Bedroom ${draft.propertyType || 'Property'} in ${draft.areaName || draft.city}`.replace(/^\s+/, '');
        }
        if (String(draft.description || '').toLowerCase() === 'auto') {
            const amenities = (draft.amenities || []).map(a => a.replace(/([A-Z])/g, ' $1').trim()).join(', ');
            draft.description = `A ${draft.propertyType || 'property'} in ${draft.areaName || draft.city}, offering ${draft.area || ''} ${draft.areaUnit || 'sq ft'} of space with ${draft.bedrooms || 0} bedroom(s), ${draft.bathrooms || 0} bathroom(s)${amenities ? ` and amenities including ${amenities}` : ''}.`;
        }
        const params = new URLSearchParams();
        params.set('aiDraft', btoa(unescape(encodeURIComponent(JSON.stringify(draft)))));

        addChips([
            { label: '📋 Use this price to list my property', action: () => { window.location.href = '/edit-flat.html?' + params.toString(); } },
            { label: '🔁 Try another property', action: () => startPriceFlow() },
            { label: '🏠 Main Menu', ghost: true, action: () => showMainMenu(false) }
        ], (opt) => opt.action());
    }


    /* ============================================================
       FLOW: FIND MATCHING FLATS (both roles)
    ============================================================ */

    function startFindFlow() {
        state.flow = 'find';
        state.slots = {};
        withTypingDelay(() => goToStep(0));
    }

    function findSteps() {
        return [
            {
                key: 'purpose',
                ask: () => 'Are you looking to rent, or to buy?',
                type: 'chips',
                options: () => [
                    { label: 'Rent', value: 'Rent' },
                    { label: 'Buy', value: 'Sale' },
                    { label: 'Either', value: 'Any' }
                ]
            },
            {
                key: 'city',
                ask: () => 'Which city (or leave it broad)?',
                type: 'chips',
                options: () => [
                    { label: 'Dhaka', value: 'Dhaka' },
                    { label: 'Chattogram', value: 'Chattogram' },
                    { label: 'Sylhet', value: 'Sylhet' },
                    { label: 'Any city', value: '', ghost: true },
                    { label: 'Other city...', value: '__other__', ghost: true }
                ]
            },
            {
                key: 'city',
                ask: () => 'Please type the city name.',
                type: 'text',
                parse: (v) => v.trim(),
                validate: (v) => (!v ? 'Please type a city name.' : null),
                showIf: (slots) => slots.city === '__other__'
            },
            {
                key: 'areaName',
                ask: () => 'Any specific neighbourhood in mind? (You can skip this.)',
                type: 'chips',
                options: () => [{ label: 'Type it in ✍️', value: '__type__' }, { label: 'Skip', value: '', ghost: true }]
            },
            {
                key: 'areaName',
                ask: () => 'Sure, what neighbourhood?',
                type: 'text',
                parse: (v) => v.trim(),
                validate: () => null,
                showIf: (slots) => slots.areaName === '__type__'
            },
            {
                key: 'budgetMax',
                ask: (slots) => `What's your maximum budget${slots.purpose === 'Sale' ? ' (total price)' : ' per month'}? (numbers only, e.g. 25000)`,
                type: 'text',
                parse: (v) => Number(String(v).replace(/[^\d.]/g, '')),
                validate: (v) => (!v || v <= 0 ? 'Please enter a valid budget amount.' : null)
            },
            {
                key: 'bedrooms',
                ask: () => 'How many bedrooms do you need, at minimum?',
                type: 'chips',
                options: () => [
                    { label: 'Any', value: '', ghost: true },
                    { label: '1', value: 1 }, { label: '2', value: 2 },
                    { label: '3', value: 3 }, { label: '4+', value: 4 }
                ]
            },
            {
                key: 'propertyType',
                ask: () => 'Any property type preference?',
                type: 'chips',
                options: () => [
                    { label: 'Any', value: 'Any', ghost: true },
                    { label: 'Apartment', value: 'Apartment' },
                    { label: 'Duplex', value: 'Duplex' },
                    { label: 'Studio', value: 'Studio' },
                    { label: 'House', value: 'House' }
                ]
            }
        ].filter(step => !step.showIf || step.showIf(state.slots) !== false);
    }

    async function submitFindFlow() {
        withTypingDelay(() => addBotMessage('Searching active FlatMate listings for a good match... 🔎'), 300);

        const slots = state.slots;
        const city = slots.city === '__other__' ? '' : slots.city;
        const areaName = slots.areaName === '__type__' ? '' : slots.areaName;

        try {
            const res = await fetch('/api/bot/suggest-flats', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    purpose: slots.purpose,
                    city,
                    areaName,
                    propertyType: slots.propertyType,
                    budgetMax: slots.budgetMax,
                    bedrooms: slots.bedrooms || null
                })
            });
            const data = await res.json();

            setTimeout(() => {
                hideTyping();
                if (!res.ok || !data.success) {
                    addErrorMessage(data.error || 'Sorry, I could not search for flats right now.');
                    offerRestart();
                    return;
                }
                renderFindResults(data.results);
            }, 500);

        } catch (err) {
            setTimeout(() => {
                hideTyping();
                addErrorMessage('Network error — please try again in a moment.');
                offerRestart();
            }, 400);
        }
    }

    function renderFindResults(results) {
        if (!results || !results.length) {
            addBotMessage("I couldn't find any active listings matching that yet. Try a wider budget or a nearby area.");
            addChips([
                { label: '🔁 Adjust my search', action: () => startFindFlow() },
                { label: '🏠 Main Menu', ghost: true, action: () => showMainMenu(false) }
            ], (opt) => opt.action());
            return;
        }

        addBotMessage(`Here are the best matches I found (${results.length}):`);

        const fairnessLabel = { bargain: 'Great value', fair: 'Fairly priced', 'above-market': 'Above market' };

        results.forEach(r => {
            const f = r.flat;
            const periodLabel = String(f.Purpose).toLowerCase().includes('rent') ? '/mo' : '';
            let html = '';

            if (r.priceFairness) {
                html += `<span class="fm-bot-tag fm-bot-tag-${r.priceFairness}">${fairnessLabel[r.priceFairness]}</span><br/>`;
            }

            html += `<div class="fm-bot-card-title">${escapeHtml(f.Title)}</div>`;
            html += `<div class="fm-bot-card-price">${formatBDT(f.Price)} <span style="font-size:11px;color:#6b7280;">${periodLabel}</span></div>`;
            html += `<div class="fm-bot-card-note">${f.Bedrooms || '?'} bed · ${f.Bathrooms || '?'} bath · ${f.Area || '?'} ${f.AreaUnit || ''} · ${escapeHtml(f.AreaName || f.City || '')}</div>`;

            if (r.reasons && r.reasons.length) {
                html += `<div class="fm-bot-card-note" style="margin-top:4px;">Why: ${escapeHtml(r.reasons.join(', '))}</div>`;
            }

            html += `<a class="fm-bot-card-link" href="/flat.html?id=${f.Id}">View property →</a>`;

            addCard(html);
        });

        addChips([
            { label: '🔁 New search', action: () => startFindFlow() },
            { label: '🏠 Main Menu', ghost: true, action: () => showMainMenu(false) }
        ], (opt) => opt.action());
    }

    function offerRestart() {
        addChips([{ label: '🏠 Main Menu', action: () => showMainMenu(false) }], (opt) => opt.action());
    }


    /* ============================================================
       BOOT
    ============================================================ */

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildWidget);
    } else {
        buildWidget();
    }

})();
