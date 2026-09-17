/* ============================================================
   FLATMATE CHAT FRONTEND
   Bangladesh Time Safe Version
============================================================ */

(() => {

    'use strict';


    // ========================================================
    // STATE
    // ========================================================

    let currentUser = null;

    let conversations = [];

    let currentConversation = null;

    let currentMessages = [];

    let refreshTimer = null;

    let isLoadingMessages = false;


    // ========================================================
    // DOM
    // ========================================================

    const conversationList =
        document.getElementById('conversation-list');

    const conversationCount =
        document.getElementById('conversation-count');

    const conversationSearch =
        document.getElementById('conversation-search');

    const chatEmpty =
        document.getElementById('chat-empty');

    const chatActive =
        document.getElementById('chat-active');

    const chatAvatar =
        document.getElementById('chat-avatar');

    const chatPersonName =
        document.getElementById('chat-person-name');

    const chatPropertyName =
        document.getElementById('chat-property-name');

    const chatPropertyLink =
        document.getElementById('chat-property-link');

    const propertyTitle =
        document.getElementById('property-title');

    const propertyLocation =
        document.getElementById('property-location');

    const propertyPrice =
        document.getElementById('property-price');

    const messagesContainer =
        document.getElementById('messages-container');

    const messageForm =
        document.getElementById('message-form');

    const messageInput =
        document.getElementById('message-input');

    const sendMessageButton =
        document.getElementById('send-message-btn');

    const characterCount =
        document.getElementById('message-character-count');


    // ========================================================
    // CONSTANT
    // ========================================================

    const BANGLADESH_TIMEZONE =
        'Asia/Dhaka';


    // ========================================================
    // INITIALIZE
    // ========================================================

    document.addEventListener(
        'DOMContentLoaded',
        initialize
    );


    async function initialize() {

        try {

            const sessionResponse =
                await fetch(
                    '/api/auth/session',
                    {
                        method: 'GET',
                        credentials: 'include'
                    }
                );


            const sessionData =
                await sessionResponse.json();


            if (
                !sessionResponse.ok ||
                !sessionData.authenticated ||
                !sessionData.user
            ) {

                window.location.href =
                    '/login.html?redirect=/chat.html';

                return;
            }


            currentUser =
                sessionData.user;


            setupEventListeners();


            await loadConversations();


            updateCharacterCount();


        } catch (error) {

            console.error(
                'Chat initialization error:',
                error
            );


            showConversationError(
                'Unable to initialize chat.'
            );
        }
    }


    // ========================================================
    // EVENT LISTENERS
    // ========================================================

    function setupEventListeners() {

        if (messageForm) {

            messageForm.addEventListener(
                'submit',
                handleSendMessage
            );
        }


        if (messageInput) {

            messageInput.addEventListener(
                'input',
                handleMessageInput
            );


            messageInput.addEventListener(
                'keydown',
                handleMessageKeydown
            );
        }


        if (conversationSearch) {

            conversationSearch.addEventListener(
                'input',
                handleConversationSearch
            );
        }
    }


    // ========================================================
    // LOAD CONVERSATIONS
    // ========================================================

    async function loadConversations() {

        try {

            if (conversationList) {

                conversationList.innerHTML = `
                    <div class="chat-loading">
                        <div class="chat-spinner"></div>
                        <p>Loading conversations...</p>
                    </div>
                `;
            }


            const response =
                await fetch(
                    '/api/chat/conversations',
                    {
                        method: 'GET',
                        credentials: 'include'
                    }
                );


            const data =
                await response.json();


            if (response.status === 401) {

                window.location.href =
                    '/login.html?redirect=/chat.html';

                return;
            }


            if (!response.ok || !data.success) {

                throw new Error(
                    data.error ||
                    'Failed to load conversations.'
                );
            }


            conversations =
                data.conversations || [];


            updateConversationCount();


            renderConversations(
                conversations
            );


        } catch (error) {

            console.error(
                'Load conversations error:',
                error
            );


            showConversationError(
                error.message
            );
        }
    }


    // ========================================================
    // CONVERSATION COUNT
    // ========================================================

    function updateConversationCount() {

        if (!conversationCount) {
            return;
        }


        const count =
            conversations.length;


        conversationCount.textContent =
            count === 0
                ? 'No conversations'
                : `${count} conversation${count === 1 ? '' : 's'}`;
    }


    // ========================================================
    // RENDER CONVERSATIONS
    // ========================================================

    function renderConversations(items) {

        if (!conversationList) {
            return;
        }


        if (!items.length) {

            conversationList.innerHTML = `
                <div class="chat-loading">
                    <p>No conversations yet.</p>
                </div>
            `;

            return;
        }


        conversationList.innerHTML =
            items.map(
                conversation =>
                    createConversationHTML(
                        conversation
                    )
            ).join('');


        conversationList
            .querySelectorAll(
                '.conversation-item'
            )
            .forEach(
                item => {

                    item.addEventListener(
                        'click',
                        () => {

                            const id =
                                Number(
                                    item.dataset.conversationId
                                );


                            openConversation(id);
                        }
                    );
                }
            );
    }


    // ========================================================
    // CONVERSATION HTML
    // ========================================================

    function createConversationHTML(
        conversation
    ) {

        const isOwner =
            Number(currentUser.id) ===
            Number(conversation.OwnerId);


        const otherName =
            isOwner
                ? conversation.UserName
                : conversation.OwnerName;


        const otherAvatar =
            isOwner
                ? (conversation.UserAvatar ? fmUrl(conversation.UserAvatar) : conversation.UserAvatar)
                : (conversation.OwnerAvatar ? fmUrl(conversation.OwnerAvatar) : conversation.OwnerAvatar);


        const unread =
            Number(
                conversation.UnreadCount || 0
            );


        const activeClass =
            currentConversation &&
            Number(currentConversation.Id) ===
            Number(conversation.Id)
                ? 'active'
                : '';


        const lastMessage =
            conversation.LastMessage ||
            'No messages yet';


        const conversationTime =
            formatRelativeTime(
                conversation.LastMessageAt ||
                conversation.UpdatedAt
            );


        return `
            <div
                class="conversation-item ${activeClass}"
                data-conversation-id="${escapeHTML(
                    conversation.Id
                )}"
            >

                <div class="conversation-avatar">

                    ${
                        otherAvatar
                            ? `
                                <img
                                    src="${escapeHTML(
                                        otherAvatar
                                    )}"
                                    alt=""
                                >
                            `
                            : escapeHTML(
                                getInitials(
                                    otherName
                                )
                            )
                    }

                </div>


                <div class="conversation-content">

                    <div class="conversation-top">

                        <h3 class="conversation-name">
                            ${escapeHTML(
                                otherName || 'User'
                            )}
                        </h3>


                        <span class="conversation-time">
                            ${conversationTime}
                        </span>

                    </div>


                    <div class="conversation-property">

                        ${escapeHTML(
                            conversation.FlatTitle ||
                            'Property'
                        )}

                    </div>


                    <div class="conversation-bottom">

                        <div class="conversation-last-message">

                            ${escapeHTML(
                                lastMessage
                            )}

                        </div>


                        ${
                            unread > 0
                                ? `
                                    <span class="unread-badge">
                                        ${
                                            unread > 99
                                                ? '99+'
                                                : unread
                                        }
                                    </span>
                                `
                                : ''
                        }

                    </div>

                </div>

            </div>
        `;
    }


    // ========================================================
    // OPEN CONVERSATION
    // ========================================================

    async function openConversation(
        conversationId
    ) {

        try {

            stopMessageRefresh();


            currentConversation =
                conversations.find(
                    conversation =>
                        Number(conversation.Id) ===
                        Number(conversationId)
                );


            if (!currentConversation) {

                throw new Error(
                    'Conversation not found.'
                );
            }


            if (chatEmpty) {

                chatEmpty.classList.add(
                    'hidden'
                );
            }


            if (chatActive) {

                chatActive.classList.remove(
                    'hidden'
                );
            }


            updateActiveConversationUI();


            await loadConversationDetails(
                conversationId
            );


            await loadMessages(
                conversationId,
                true
            );


            await markConversationAsRead(
                conversationId
            );


            startMessageRefresh();


        } catch (error) {

            console.error(
                'Open conversation error:',
                error
            );


            if (messagesContainer) {

                messagesContainer.innerHTML = `
                    <div class="chat-error">
                        ${escapeHTML(
                            error.message
                        )}
                    </div>
                `;
            }
        }
    }


    // ========================================================
    // CONVERSATION DETAILS
    // ========================================================

    async function loadConversationDetails(
        conversationId
    ) {

        const response =
            await fetch(
                `/api/chat/conversations/${conversationId}`,
                {
                    method: 'GET',
                    credentials: 'include'
                }
            );


        const data =
            await response.json();


        if (!response.ok || !data.success) {

            throw new Error(
                data.error ||
                'Failed to load conversation.'
            );
        }


        currentConversation =
            data.conversation;


        updateActiveConversationUI();
    }


    // ========================================================
    // UPDATE ACTIVE UI
    // ========================================================

    function updateActiveConversationUI() {

        if (!currentConversation) {
            return;
        }


        const isOwner =
            Number(currentUser.id) ===
            Number(currentConversation.OwnerId);


        const otherName =
            isOwner
                ? currentConversation.UserName
                : currentConversation.OwnerName;


        const otherAvatar =
            isOwner
                ? (currentConversation.UserAvatar ? fmUrl(currentConversation.UserAvatar) : currentConversation.UserAvatar)
                : (currentConversation.OwnerAvatar ? fmUrl(currentConversation.OwnerAvatar) : currentConversation.OwnerAvatar);


        if (chatPersonName) {

            chatPersonName.textContent =
                otherName || 'User';
        }


        if (chatPropertyName) {

            chatPropertyName.textContent =
                currentConversation.FlatTitle ||
                'Property';
        }


        if (propertyTitle) {

            propertyTitle.textContent =
                currentConversation.FlatTitle ||
                '—';
        }


        if (propertyLocation) {

            propertyLocation.textContent =
                [
                    currentConversation.AreaName,
                    currentConversation.City
                ]
                    .filter(Boolean)
                    .join(', ') ||
                currentConversation.Address ||
                '—';
        }


        if (propertyPrice) {

            propertyPrice.textContent =
                formatPrice(
                    currentConversation.Price
                );
        }


        if (chatPropertyLink) {

            chatPropertyLink.href =
                `/flat.html?id=${encodeURIComponent(
                    currentConversation.FlatId
                )}`;
        }

        const unavailable = String(currentConversation.AvailabilityStatus || 'Available') !== 'Available';
        if (messageInput) {
            messageInput.disabled = unavailable;
            messageInput.placeholder = unavailable
                ? `Property is ${String(currentConversation.AvailabilityStatus).toLowerCase()}. Messaging is disabled.`
                : 'Write a message...';
        }
        if (sendMessageButton) sendMessageButton.disabled = unavailable;
        const existingNotice = document.getElementById('chat-availability-notice');
        if (existingNotice) existingNotice.remove();
        if (unavailable && messagesContainer?.parentElement) {
            const notice = document.createElement('div');
            notice.id = 'chat-availability-notice';
            notice.className = 'chat-error';
            notice.textContent = `This property is ${String(currentConversation.AvailabilityStatus).toLowerCase()}. New messages are disabled.`;
            messagesContainer.parentElement.appendChild(notice);
        }


        if (chatAvatar) {

            if (otherAvatar) {

                chatAvatar.innerHTML = `
                    <img
                        src="${escapeHTML(
                            otherAvatar
                        )}"
                        alt=""
                    >
                `;

            } else {

                chatAvatar.textContent =
                    getInitials(
                        otherName
                    );
            }
        }


        renderConversations(
            conversations
        );
    }


    // ========================================================
    // LOAD MESSAGES
    // ========================================================

    async function loadMessages(
        conversationId,
        showLoading = false
    ) {

        if (isLoadingMessages) {
            return;
        }


        isLoadingMessages = true;


        try {

            if (
                showLoading &&
                messagesContainer
            ) {

                messagesContainer.innerHTML = `
                    <div class="chat-loading">
                        <div class="chat-spinner"></div>
                        <p>Loading messages...</p>
                    </div>
                `;
            }


            const response =
                await fetch(
                    `/api/chat/conversations/${conversationId}/messages`,
                    {
                        method: 'GET',
                        credentials: 'include'
                    }
                );


            const data =
                await response.json();


            if (response.status === 401) {

                window.location.href =
                    '/login.html?redirect=/chat.html';

                return;
            }


            if (!response.ok || !data.success) {

                throw new Error(
                    data.error ||
                    'Failed to load messages.'
                );
            }


            currentMessages =
                data.messages || [];


            renderMessages();


        } catch (error) {

            console.error(
                'Load messages error:',
                error
            );


            if (messagesContainer) {

                messagesContainer.innerHTML = `
                    <div class="chat-error">
                        ${escapeHTML(
                            error.message
                        )}
                    </div>
                `;
            }


        } finally {

            isLoadingMessages = false;
        }
    }


    // ========================================================
    // RENDER MESSAGES
    // ========================================================

    function renderMessages() {

        if (!messagesContainer) {
            return;
        }


        if (!currentMessages.length) {

            messagesContainer.innerHTML = `
                <div class="messages-empty">

                    <div class="messages-empty-icon">
                        💬
                    </div>

                    <h3>
                        Start the conversation
                    </h3>

                    <p>
                        Send a message about this property.
                    </p>

                </div>
            `;

            return;
        }


        messagesContainer.innerHTML =
            currentMessages.map(
                message => {

                    const mine =
                        Number(
                            message.SenderId
                        ) ===
                        Number(currentUser.id);


                    return `
                        <div
                            class="message-row ${
                                mine
                                    ? 'mine'
                                    : 'theirs'
                            }"
                        >

                            <div class="message-bubble">

                                <div class="message-text">
                                    ${escapeHTML(
                                        message.MessageText
                                    )}
                                </div>


                                <div class="message-meta">

                                    <span>
                                        ${formatMessageTime(
                                            message.CreatedAt
                                        )}
                                    </span>


                                    ${
                                        mine
                                            ? `
                                                <span>
                                                    ${
                                                        Number(
                                                            message.IsRead
                                                        ) === 1 ||
                                                        message.IsRead === true
                                                            ? '✓✓'
                                                            : '✓'
                                                    }
                                                </span>
                                            `
                                            : ''
                                    }

                                </div>

                            </div>

                        </div>
                    `;
                }
            ).join('');


        scrollMessagesToBottom();
    }


    // ========================================================
    // SEND MESSAGE
    // ========================================================

    async function handleSendMessage(
        event
    ) {

        event.preventDefault();


        if (!currentConversation) {

            alert(
                'Please select a conversation first.'
            );

            return;
        }


        const message =
            messageInput
                ? messageInput.value.trim()
                : '';


        if (!message) {
            return;
        }


        if (message.length > 5000) {

            alert(
                'Message cannot exceed 5000 characters.'
            );

            return;
        }


        if (sendMessageButton) {

            sendMessageButton.disabled = true;
        }


        try {

            const response =
                await fetch(
                    `/api/chat/conversations/${currentConversation.Id}/messages`,
                    {
                        method: 'POST',

                        credentials: 'include',

                        headers: {
                            'Content-Type':
                                'application/json'
                        },

                        body: JSON.stringify({
                            message
                        })
                    }
                );


            const data =
                await response.json();


            if (response.status === 401) {

                window.location.href =
                    '/login.html?redirect=/chat.html';

                return;
            }


            if (!response.ok || !data.success) {

                throw new Error(
                    data.error ||
                    'Failed to send message.'
                );
            }


            if (messageInput) {

                messageInput.value = '';
            }


            updateCharacterCount();


            autoResizeTextarea();


            await loadMessages(
                currentConversation.Id
            );


            await loadConversations();


            /*
             * loadConversations() replaces the conversation
             * objects. Restore the currently selected
             * conversation from the new list.
             */

            const refreshedConversation =
                conversations.find(
                    conversation =>
                        Number(conversation.Id) ===
                        Number(currentConversation.Id)
                );


            if (refreshedConversation) {

                currentConversation =
                    refreshedConversation;

                updateActiveConversationUI();
            }


        } catch (error) {

            console.error(
                'Send message error:',
                error
            );


            alert(
                error.message
            );


        } finally {

            if (sendMessageButton) {

                sendMessageButton.disabled = false;
            }


            if (messageInput) {

                messageInput.focus();
            }
        }
    }


    // ========================================================
    // MARK AS READ
    // ========================================================

    async function markConversationAsRead(
        conversationId
    ) {

        try {

            await fetch(
                `/api/chat/conversations/${conversationId}/read`,
                {
                    method: 'PUT',
                    credentials: 'include'
                }
            );


        } catch (error) {

            console.error(
                'Mark read error:',
                error
            );
        }
    }


    // ========================================================
    // AUTO REFRESH
    // ========================================================

    function startMessageRefresh() {

        stopMessageRefresh();


        refreshTimer =
            setInterval(
                async () => {

                    if (
                        !currentConversation ||
                        document.hidden
                    ) {
                        return;
                    }


                    try {

                        await loadMessages(
                            currentConversation.Id
                        );


                        await markConversationAsRead(
                            currentConversation.Id
                        );


                    } catch (error) {

                        console.error(
                            'Message refresh error:',
                            error
                        );
                    }

                },
                5000
            );
    }


    function stopMessageRefresh() {

        if (refreshTimer) {

            clearInterval(
                refreshTimer
            );

            refreshTimer = null;
        }
    }


    // ========================================================
    // SEARCH CONVERSATIONS
    // ========================================================

    function handleConversationSearch() {

        if (!conversationSearch) {
            return;
        }


        const query =
            conversationSearch.value
                .trim()
                .toLowerCase();


        if (!query) {

            renderConversations(
                conversations
            );

            return;
        }


        const filtered =
            conversations.filter(
                conversation => {

                    const isOwner =
                        Number(currentUser.id) ===
                        Number(
                            conversation.OwnerId
                        );


                    const personName =
                        isOwner
                            ? conversation.UserName
                            : conversation.OwnerName;


                    return [
                        personName,
                        conversation.FlatTitle,
                        conversation.City,
                        conversation.AreaName,
                        conversation.LastMessage
                    ]
                        .filter(Boolean)
                        .some(
                            value =>
                                String(value)
                                    .toLowerCase()
                                    .includes(query)
                        );
                }
            );


        renderConversations(
            filtered
        );
    }


    // ========================================================
    // MESSAGE INPUT
    // ========================================================

    function handleMessageInput() {

        updateCharacterCount();

        autoResizeTextarea();
    }


    function handleMessageKeydown(
        event
    ) {

        if (
            event.key === 'Enter' &&
            !event.shiftKey
        ) {

            event.preventDefault();


            if (messageForm) {

                messageForm.requestSubmit();
            }
        }
    }


    function updateCharacterCount() {

        if (
            !messageInput ||
            !characterCount
        ) {
            return;
        }


        const length =
            messageInput.value.length;


        characterCount.textContent =
            `${length} / 5000`;
    }


    function autoResizeTextarea() {

        if (!messageInput) {
            return;
        }


        messageInput.style.height =
            'auto';


        messageInput.style.height =
            Math.min(
                messageInput.scrollHeight,
                130
            ) + 'px';
    }


    // ========================================================
    // SCROLL
    // ========================================================

    function scrollMessagesToBottom() {

        if (!messagesContainer) {
            return;
        }


        requestAnimationFrame(
            () => {

                messagesContainer.scrollTop =
                    messagesContainer.scrollHeight;
            }
        );
    }


    // ========================================================
    // GET INITIALS
    // ========================================================

    function getInitials(name) {

        if (!name) {
            return 'U';
        }


        const parts =
            String(name)
                .trim()
                .split(/\s+/)
                .slice(0, 2);


        return parts
            .map(
                part =>
                    part
                        .charAt(0)
                        .toUpperCase()
            )
            .join('');
    }


    // ========================================================
    // FORMAT PRICE
    // ========================================================

    function formatPrice(price) {

        if (
            price === null ||
            price === undefined ||
            price === ''
        ) {

            return '—';
        }


        const number =
            Number(price);


        if (Number.isNaN(number)) {

            return String(price);
        }


        return `৳${number.toLocaleString(
            'en-BD'
        )}`;
    }


    // ========================================================
    // BANGLADESH CURRENT TIME
    //
    // Returns the current Bangladesh clock as a
    // "fake UTC" timestamp.
    //
    // Example:
    // Bangladesh 18:53
    // becomes an internal timestamp representing
    // 18:53, without applying another +6 hours.
    // ========================================================

    function getBangladeshNow() {

        const parts =
            new Intl.DateTimeFormat(
                'en-US',
                {
                    timeZone: BANGLADESH_TIMEZONE,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hourCycle: 'h23'
                }
            ).formatToParts(
                new Date()
            );


        const values = {};


        parts.forEach(
            part => {

                if (part.type !== 'literal') {

                    values[part.type] =
                        Number(part.value);
                }
            }
        );


        return new Date(
            Date.UTC(
                values.year,
                values.month - 1,
                values.day,
                values.hour,
                values.minute,
                values.second,
                0
            )
        );
    }


    // ========================================================
    // PARSE DATABASE DATE
    //
    // IMPORTANT:
    //
    // ChatMessages.CreatedAt is treated as Bangladesh
    // local database time.
    //
    // Supported examples:
    //
    // 2026-08-12 18:53:34.517
    //
    // 2026-08-12T18:53:34.517
    //
    // 2026-08-12T18:53:34.517Z
    //
    // The Z is intentionally ignored for chat database
    // timestamps because SQL Server DATETIME does not
    // contain timezone information.
    // ========================================================

    function parseDatabaseDate(value) {

        if (
            value === null ||
            value === undefined ||
            value === ''
        ) {

            return null;
        }


        const stringValue =
            String(value).trim();


        /*
         * Convert SQL Server / ISO format into a
         * normalized Bangladesh-local clock.
         *
         * We intentionally remove:
         *
         * - Z
         * - timezone offsets
         *
         * because CreatedAt is a SQL DATETIME value
         * representing Bangladesh local time in this project.
         */

        const match =
            stringValue.match(
                /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|[+-]\d{2}:?\d{2})?$/
            );


        if (match) {

            const year =
                Number(match[1]);


            const month =
                Number(match[2]) - 1;


            const day =
                Number(match[3]);


            const hour =
                Number(match[4]);


            const minute =
                Number(match[5]);


            const second =
                Number(match[6]);


            const milliseconds =
                match[7]
                    ? Number(
                        match[7]
                            .padEnd(3, '0')
                            .slice(0, 3)
                    )
                    : 0;


            return {
                date:
                    new Date(
                        Date.UTC(
                            year,
                            month,
                            day,
                            hour,
                            minute,
                            second,
                            milliseconds
                        )
                    ),

                isDatabaseLocal:
                    true
            };
        }


        /*
         * Fallback for Date objects or other values.
         */

        const parsed =
            new Date(value);


        if (
            Number.isNaN(
                parsed.getTime()
            )
        ) {

            return null;
        }


        return {
            date: parsed,
            isDatabaseLocal: false
        };
    }


    // ========================================================
    // FORMAT MESSAGE TIME
    //
    // This is the main function responsible for the
    // message date/time shown inside chat bubbles.
    // ========================================================

    function formatMessageTime(value) {

        const parsed =
            parseDatabaseDate(
                value
            );


        if (!parsed) {
            return '';
        }


        /*
         * Database-local Bangladesh time.
         *
         * Example:
         *
         * DB:
         * 2026-08-12 18:53:34
         *
         * Display:
         * Aug 12, 2026, 6:53:34 PM
         *
         * NO +6 conversion.
         */

        if (parsed.isDatabaseLocal) {

            return new Intl.DateTimeFormat(
                'en-BD',
                {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true,
                    timeZone: 'UTC'
                }
            ).format(
                parsed.date
            );
        }


        /*
         * Fallback for a genuine timezone-aware value.
         */

        return new Intl.DateTimeFormat(
            'en-BD',
            {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
                timeZone: BANGLADESH_TIMEZONE
            }
        ).format(
            parsed.date
        );
    }


    // ========================================================
    // RELATIVE CONVERSATION TIME
    // ========================================================

    function formatRelativeTime(value) {

        const parsed =
            parseDatabaseDate(
                value
            );


        if (!parsed) {
            return '';
        }


        let messageTime;


        if (parsed.isDatabaseLocal) {

            /*
             * Both values are now represented as
             * Bangladesh clock time.
             */

            messageTime =
                parsed.date.getTime();

        } else {

            messageTime =
                parsed.date.getTime();
        }


        const now =
            getBangladeshNow()
                .getTime();


        const diff =
            Math.max(
                0,
                now - messageTime
            );


        const minutes =
            Math.floor(
                diff / 60000
            );


        if (minutes < 1) {
            return 'now';
        }


        if (minutes < 60) {

            return `${minutes}m`;
        }


        const hours =
            Math.floor(
                minutes / 60
            );


        if (hours < 24) {

            return `${hours}h`;
        }


        const days =
            Math.floor(
                hours / 24
            );


        if (days < 7) {

            return `${days}d`;
        }


        /*
         * Show actual Bangladesh date for older
         * conversations.
         */

        if (parsed.isDatabaseLocal) {

            return new Intl.DateTimeFormat(
                'en-BD',
                {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'UTC'
                }
            ).format(
                parsed.date
            );
        }


        return new Intl.DateTimeFormat(
            'en-BD',
            {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                timeZone: BANGLADESH_TIMEZONE
            }
        ).format(
            parsed.date
        );
    }


    // ========================================================
    // ESCAPE HTML
    // ========================================================

    function escapeHTML(value) {

        if (
            value === null ||
            value === undefined
        ) {

            return '';
        }


        return String(value)
            .replace(
                /&/g,
                '&amp;'
            )
            .replace(
                /</g,
                '&lt;'
            )
            .replace(
                />/g,
                '&gt;'
            )
            .replace(
                /"/g,
                '&quot;'
            )
            .replace(
                /'/g,
                '&#039;'
            );
    }


    // ========================================================
    // ERROR
    // ========================================================

    function showConversationError(
        message
    ) {

        if (!conversationList) {
            return;
        }


        conversationList.innerHTML = `
            <div class="chat-error">
                ${escapeHTML(
                    message
                )}
            </div>
        `;
    }


    // ========================================================
    // CLEANUP
    // ========================================================

    window.addEventListener(
        'beforeunload',
        () => {

            stopMessageRefresh();

        }
    );


})();