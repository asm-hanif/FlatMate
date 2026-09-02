const express = require('express');
const router = express.Router();

const { executeSql, sql } = require('../db');


// ============================================================
// GET LOGGED-IN USER ID
// ============================================================

function getLoggedInUserId(req) {
    if (!req.session) {
        return null;
    }

    // New session structure
    if (req.session.user) {
        return Number(
            req.session.user.id ||
            req.session.user.Id
        ) || null;
    }

    // Backward-compatible session structure
    if (req.session.userId) {
        return Number(req.session.userId) || null;
    }

    return null;
}


// ============================================================
// GET MY CONVERSATIONS
// GET /api/chat/conversations
// ============================================================

router.get('/conversations', async (req, res) => {

    try {

        const userId = getLoggedInUserId(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Please log in first.'
            });
        }

        const result = await executeSql(
            `
            SELECT
                c.Id,
                c.FlatId,
                c.UserId,
                c.OwnerId,
                c.CreatedAt,
                c.UpdatedAt,

                f.Title AS FlatTitle,
                f.City,
                f.AreaName,
                f.Address,
                f.Price,
                f.Purpose,
                f.AvailabilityStatus,

                u.Name AS UserName,
                u.Email AS UserEmail,
                u.AvatarUrl AS UserAvatar,

                o.Name AS OwnerName,
                o.Email AS OwnerEmail,
                o.AvatarUrl AS OwnerAvatar,

                lm.MessageText AS LastMessage,
                lm.CreatedAt AS LastMessageAt,
                lm.SenderId AS LastMessageSenderId,

                (
                    SELECT COUNT(*)
                    FROM dbo.ChatMessages unread
                    WHERE unread.ConversationId = c.Id
                      AND unread.IsRead = 0
                      AND unread.SenderId <> @userId
                ) AS UnreadCount

            FROM dbo.ChatConversations c

            INNER JOIN dbo.Flats f
                ON f.Id = c.FlatId

            INNER JOIN dbo.Users u
                ON u.Id = c.UserId

            INNER JOIN dbo.Users o
                ON o.Id = c.OwnerId

            LEFT JOIN LATERAL
            (
                SELECT
                    m.MessageText,
                    m.CreatedAt,
                    m.SenderId
                FROM dbo.ChatMessages m
                WHERE m.ConversationId = c.Id
                ORDER BY m.CreatedAt DESC, m.Id DESC
                LIMIT 1
            ) lm ON true

            WHERE
                c.UserId = @userId
                OR c.OwnerId = @userId

            ORDER BY
                COALESCE(lm.CreatedAt, c.UpdatedAt) DESC;
            `,
            [
                {
                    name: 'userId',
                    type: sql.Int,
                    value: userId
                }
            ]
        );

        return res.json({
            success: true,
            conversations: result || []
        });

    } catch (error) {

        console.error('Get conversations error:', error);

        return res.status(500).json({
            success: false,
            error: 'Failed to load conversations.'
        });
    }
});


// ============================================================
// CREATE OR GET CONVERSATION
// POST /api/chat/conversations
// ============================================================

router.post('/conversations', async (req, res) => {

    try {

        const userId = getLoggedInUserId(req);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Please log in first.'
            });
        }

        const flatId = Number(req.body.flatId);

        if (!Number.isInteger(flatId) || flatId <= 0) {
            return res.status(400).json({
                success: false,
                error: 'A valid property ID is required.'
            });
        }


        // ====================================================
        // FIND PROPERTY
        // ====================================================

        const flatResult = await executeSql(
            `
            SELECT
                Id,
                OwnerId,
                Title,
                IsActive,
                AvailabilityStatus
            FROM dbo.Flats
            WHERE Id = @flatId;
            `,
            [
                {
                    name: 'flatId',
                    type: sql.Int,
                    value: flatId
                }
            ]
        );


        if (!flatResult || flatResult.length === 0) {

            console.log(
                `Chat property lookup failed. flatId=${flatId}`
            );

            return res.status(404).json({
                success: false,
                error: 'Property not found.'
            });
        }


        const flat = flatResult[0];


        // ====================================================
        // CHECK PROPERTY STATUS
        // ====================================================

        if (!flat.IsActive) {
            return res.status(400).json({ success: false, error: 'This property is currently unavailable.' });
        }

        if (String(flat.AvailabilityStatus || 'Available') !== 'Available') {
            return res.status(400).json({
                success: false,
                error: `This property has been marked ${String(flat.AvailabilityStatus).toLowerCase()}. Contact and chat are disabled.`
            });
        }


        // ====================================================
        // GET OWNER
        // ====================================================

        const ownerId = Number(flat.OwnerId);

        if (!ownerId) {

            return res.status(500).json({
                success: false,
                error: 'This property does not have a valid owner.'
            });
        }


        // ====================================================
        // OWNER CANNOT CHAT WITH THEMSELVES
        // ====================================================

        if (ownerId === userId) {

            return res.status(400).json({
                success: false,
                error: 'You cannot start a chat with yourself.'
            });
        }


        // ====================================================
        // CHECK EXISTING CONVERSATION
        // ====================================================

        const existingResult = await executeSql(
            `
            SELECT
                Id,
                FlatId,
                UserId,
                OwnerId,
                CreatedAt,
                UpdatedAt
            FROM dbo.ChatConversations
            WHERE
                FlatId = @flatId
                AND UserId = @userId
                AND OwnerId = @ownerId;
            `,
            [
                {
                    name: 'flatId',
                    type: sql.Int,
                    value: flatId
                },
                {
                    name: 'userId',
                    type: sql.Int,
                    value: userId
                },
                {
                    name: 'ownerId',
                    type: sql.Int,
                    value: ownerId
                }
            ]
        );


        if (
            existingResult &&
            existingResult.length > 0
        ) {

            return res.json({
                success: true,
                conversation: existingResult[0],
                existing: true
            });
        }


        // ====================================================
        // CREATE CONVERSATION
        // ====================================================

        const createResult = await executeSql(
            `
            INSERT INTO dbo.ChatConversations
            (
                FlatId,
                UserId,
                OwnerId,
                CreatedAt,
                UpdatedAt
            )
            VALUES
            (
                @flatId,
                @userId,
                @ownerId,
                GETDATE(),
                GETDATE()
            )
            RETURNING
                Id,
                FlatId,
                UserId,
                OwnerId,
                CreatedAt,
                UpdatedAt;
            `,
            [
                {
                    name: 'flatId',
                    type: sql.Int,
                    value: flatId
                },
                {
                    name: 'userId',
                    type: sql.Int,
                    value: userId
                },
                {
                    name: 'ownerId',
                    type: sql.Int,
                    value: ownerId
                }
            ]
        );


        if (
            !createResult ||
            createResult.length === 0
        ) {

            return res.status(500).json({
                success: false,
                error: 'Conversation could not be created.'
            });
        }


        return res.status(201).json({
            success: true,
            conversation: createResult[0],
            existing: false
        });

    } catch (error) {

        console.error(
            'Create conversation error:',
            error
        );

        return res.status(500).json({
            success: false,
            error: 'Failed to create conversation.'
        });
    }
});


// ============================================================
// GET CONVERSATION DETAILS
// GET /api/chat/conversations/:id
// ============================================================

router.get('/conversations/:id', async (req, res) => {

    try {

        const userId = getLoggedInUserId(req);
        const conversationId = Number(req.params.id);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Please log in first.'
            });
        }

        if (
            !Number.isInteger(conversationId) ||
            conversationId <= 0
        ) {
            return res.status(400).json({
                success: false,
                error: 'Invalid conversation ID.'
            });
        }


        const result = await executeSql(
            `
            SELECT
                c.Id,
                c.FlatId,
                c.UserId,
                c.OwnerId,
                c.CreatedAt,
                c.UpdatedAt,

                f.Title AS FlatTitle,
                f.Description AS FlatDescription,
                f.City,
                f.AreaName,
                f.Address,
                f.Price,
                f.Purpose,
                f.AvailabilityStatus,

                u.Name AS UserName,
                u.Email AS UserEmail,
                u.Phone AS UserPhone,
                u.AvatarUrl AS UserAvatar,

                o.Name AS OwnerName,
                o.Email AS OwnerEmail,
                o.Phone AS OwnerPhone,
                o.AvatarUrl AS OwnerAvatar

            FROM dbo.ChatConversations c

            INNER JOIN dbo.Flats f
                ON f.Id = c.FlatId

            INNER JOIN dbo.Users u
                ON u.Id = c.UserId

            INNER JOIN dbo.Users o
                ON o.Id = c.OwnerId

            WHERE
                c.Id = @conversationId
                AND
                (
                    c.UserId = @userId
                    OR
                    c.OwnerId = @userId
                );
            `,
            [
                {
                    name: 'conversationId',
                    type: sql.Int,
                    value: conversationId
                },
                {
                    name: 'userId',
                    type: sql.Int,
                    value: userId
                }
            ]
        );


        if (!result || result.length === 0) {

            return res.status(404).json({
                success: false,
                error: 'Conversation not found.'
            });
        }


        return res.json({
            success: true,
            conversation: result[0]
        });

    } catch (error) {

        console.error(
            'Get conversation error:',
            error
        );

        return res.status(500).json({
            success: false,
            error: 'Failed to load conversation.'
        });
    }
});


// ============================================================
// GET MESSAGES
// GET /api/chat/conversations/:id/messages
// ============================================================

router.get('/conversations/:id/messages', async (req, res) => {

    try {

        const userId = getLoggedInUserId(req);
        const conversationId = Number(req.params.id);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Please log in first.'
            });
        }

        if (
            !Number.isInteger(conversationId) ||
            conversationId <= 0
        ) {
            return res.status(400).json({
                success: false,
                error: 'Invalid conversation ID.'
            });
        }


        const membership = await executeSql(
            `
            SELECT c.Id
            FROM dbo.ChatConversations c
            WHERE
                c.Id = @conversationId
                AND
                (
                    c.UserId = @userId
                    OR
                    c.OwnerId = @userId
                );
            `,
            [
                {
                    name: 'conversationId',
                    type: sql.Int,
                    value: conversationId
                },
                {
                    name: 'userId',
                    type: sql.Int,
                    value: userId
                }
            ]
        );


        if (!membership || membership.length === 0) {

            return res.status(403).json({
                success: false,
                error: 'You do not have access to this conversation.'
            });
        }


        const result = await executeSql(
            `
            SELECT
                m.Id,
                m.ConversationId,
                m.SenderId,
                m.MessageText,
                m.IsRead,
                m.CreatedAt,

                u.Name AS SenderName,
                u.AvatarUrl AS SenderAvatar

            FROM dbo.ChatMessages m

            INNER JOIN dbo.Users u
                ON u.Id = m.SenderId

            WHERE
                m.ConversationId = @conversationId

            ORDER BY
                m.CreatedAt ASC,
                m.Id ASC;
            `,
            [
                {
                    name: 'conversationId',
                    type: sql.Int,
                    value: conversationId
                }
            ]
        );


        return res.json({
            success: true,
            messages: result || []
        });

    } catch (error) {

        console.error(
            'Get messages error:',
            error
        );

        return res.status(500).json({
            success: false,
            error: 'Failed to load messages.'
        });
    }
});


// ============================================================
// SEND MESSAGE
// POST /api/chat/conversations/:id/messages
// ============================================================

router.post('/conversations/:id/messages', async (req, res) => {

    try {

        const userId = getLoggedInUserId(req);
        const conversationId = Number(req.params.id);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Please log in first.'
            });
        }

        if (
            !Number.isInteger(conversationId) ||
            conversationId <= 0
        ) {
            return res.status(400).json({
                success: false,
                error: 'Invalid conversation ID.'
            });
        }


        let { message } = req.body;

        if (typeof message !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Message is required.'
            });
        }


        message = message.trim();


        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Message cannot be empty.'
            });
        }


        if (message.length > 5000) {
            return res.status(400).json({
                success: false,
                error: 'Message cannot exceed 5000 characters.'
            });
        }


        const conversation = await executeSql(
            `
            SELECT
                c.Id,
                c.UserId,
                c.OwnerId,
                f.IsActive,
                f.AvailabilityStatus
            FROM dbo.ChatConversations c
            INNER JOIN dbo.Flats f ON f.Id = c.FlatId
            WHERE
                c.Id = @conversationId
                AND
                (
                    c.UserId = @userId
                    OR
                    c.OwnerId = @userId
                );
            `,
            [
                {
                    name: 'conversationId',
                    type: sql.Int,
                    value: conversationId
                },
                {
                    name: 'userId',
                    type: sql.Int,
                    value: userId
                }
            ]
        );


        if (!conversation || conversation.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'You do not have access to this conversation.'
            });
        }

        const currentFlat = conversation[0];
        if (!currentFlat.IsActive) {
            return res.status(400).json({ success: false, error: 'This property is no longer active.' });
        }
        if (String(currentFlat.AvailabilityStatus || 'Available') !== 'Available') {
            return res.status(400).json({
                success: false,
                error: `This property has been marked ${String(currentFlat.AvailabilityStatus).toLowerCase()}. New messages are disabled.`
            });
        }

        const result = await executeSql(
            `
            INSERT INTO dbo.ChatMessages
            (
                ConversationId,
                SenderId,
                MessageText,
                IsRead,
                CreatedAt
            )
            VALUES
            (
                @conversationId,
                @userId,
                @message,
                0,
                GETDATE()
            )
            RETURNING
                Id,
                ConversationId,
                SenderId,
                MessageText,
                IsRead,
                CreatedAt;
            `,
            [
                {
                    name: 'conversationId',
                    type: sql.Int,
                    value: conversationId
                },
                {
                    name: 'userId',
                    type: sql.Int,
                    value: userId
                },
                {
                    name: 'message',
                    type: sql.NVarChar(5000),
                    value: message
                }
            ]
        );


        await executeSql(
            `
            UPDATE dbo.ChatConversations
            SET UpdatedAt = GETDATE()
            WHERE Id = @conversationId;
            `,
            [
                {
                    name: 'conversationId',
                    type: sql.Int,
                    value: conversationId
                }
            ]
        );


        return res.status(201).json({
            success: true,
            message: result[0]
        });

    } catch (error) {

        console.error(
            'Send message error:',
            error
        );

        return res.status(500).json({
            success: false,
            error: 'Failed to send message.'
        });
    }
});


// ============================================================
// MARK MESSAGES AS READ
// PUT /api/chat/conversations/:id/read
// ============================================================

router.put('/conversations/:id/read', async (req, res) => {

    try {

        const userId = getLoggedInUserId(req);
        const conversationId = Number(req.params.id);

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Please log in first.'
            });
        }

        if (
            !Number.isInteger(conversationId) ||
            conversationId <= 0
        ) {
            return res.status(400).json({
                success: false,
                error: 'Invalid conversation ID.'
            });
        }


        const result = await executeSql(
            `
            UPDATE dbo.ChatMessages m
            SET IsRead = 1

            FROM dbo.ChatConversations c

            WHERE
                c.Id = m.ConversationId
                AND m.ConversationId = @conversationId
                AND m.SenderId <> @userId
                AND m.IsRead = 0
                AND
                (
                    c.UserId = @userId
                    OR
                    c.OwnerId = @userId
                );
            `,
            [
                {
                    name: 'conversationId',
                    type: sql.Int,
                    value: conversationId
                },
                {
                    name: 'userId',
                    type: sql.Int,
                    value: userId
                }
            ]
        );


        return res.json({
            success: true,
            message: 'Messages marked as read.'
        });

    } catch (error) {

        console.error(
            'Mark messages read error:',
            error
        );

        return res.status(500).json({
            success: false,
            error: 'Failed to mark messages as read.'
        });
    }
});


module.exports = router;