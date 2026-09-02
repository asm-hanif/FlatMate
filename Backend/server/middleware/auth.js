function getSessionRole(req) {
    return String(
        req.session?.role ||
        req.session?.user?.role ||
        req.session?.user?.Role ||
        ''
    );
}

function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) return next();
    return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
}

function isOwner(req, res, next) {
    if (['owner','both'].includes(getSessionRole(req).toLowerCase())) return next();
    return res.status(403).json({ success: false, error: 'Owner access required.' });
}

function isUser(req, res, next) {
    if (['user','both'].includes(getSessionRole(req).toLowerCase())) return next();
    return res.status(403).json({ success: false, error: 'Home seeker access required.' });
}

module.exports = { isAuthenticated, isOwner, isUser, getSessionRole };
