// ================================================================
// FlatMate — Owner Dashboard
// ================================================================


document.addEventListener('DOMContentLoaded', () => {

    const dashboardContainer =
        document.getElementById('dashboardContainer');

    if (dashboardContainer) {
        loadDashboard();
    }

});


// ================================================================
// LOAD DASHBOARD
// ================================================================

async function loadDashboard() {

    const dashboardContainer =
        document.getElementById('dashboardContainer');

    if (!dashboardContainer) {
        return;
    }

    try {

        // ---------------------------------------------------------
        // 1. Get current session
        // ---------------------------------------------------------

        const sessionRes = await fetch(
            '/api/auth/session',
            {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store'
            }
        );

        if (!sessionRes.ok) {
            throw new Error(
                'Unable to get session.'
            );
        }

        const sessionData =
            await sessionRes.json();

        console.log(
            'Owner dashboard session:',
            sessionData
        );


        // ---------------------------------------------------------
        // 2. Check login
        // ---------------------------------------------------------

        if (
            !sessionData ||
            !sessionData.user
        ) {

            dashboardContainer.innerHTML = `

                <div class="owner-empty-state">

                    <div class="owner-empty-icon">
                        <i class="fas fa-lock"></i>
                    </div>

                    <h3>
                        Please Sign In
                    </h3>

                    <p>
                        You must be logged in to access
                        your owner dashboard.
                    </p>

                    <a
                        href="/login.html"
                        class="btn btn-primary"
                    >
                        <i class="fas fa-right-to-bracket"></i>
                        Sign In
                    </a>

                </div>

            `;

            return;
        }


        // ---------------------------------------------------------
        // 3. Get user ID safely
        // ---------------------------------------------------------

        const currentUserId = Number(

            sessionData.user.id ??
            sessionData.user.Id ??
            sessionData.user.userId ??
            sessionData.user.UserId

        );

        console.log(
            'Current user ID:',
            currentUserId
        );


        if (!Number.isFinite(currentUserId)) {

            console.error(
                'Invalid user ID in session:',
                sessionData
            );

            dashboardContainer.innerHTML = `

                <div class="owner-empty-state">

                    <div class="owner-empty-icon">
                        <i class="fas fa-user-slash"></i>
                    </div>

                    <h3>
                        Session Error
                    </h3>

                    <p>
                        We could not determine your user account.
                        Please sign in again.
                    </p>

                    <a
                        href="/login.html"
                        class="btn btn-primary"
                    >
                        Sign In Again
                    </a>

                </div>

            `;

            return;
        }


        // ---------------------------------------------------------
        // 4. Check owner role
        // ---------------------------------------------------------

        const role =
            sessionData.user.role ??
            sessionData.user.Role ??
            sessionData.role ??
            sessionData.Role;

        console.log(
            'Current user role:',
            role
        );


        if (
            role &&
            !['owner','both'].includes(String(role).toLowerCase())
        ) {

            dashboardContainer.innerHTML = `

                <div class="owner-empty-state">

                    <div class="owner-empty-icon">
                        <i class="fas fa-user-shield"></i>
                    </div>

                    <h3>
                        Owner Access Required
                    </h3>

                    <p>
                        This dashboard is only available
                        to property owners.
                    </p>

                    <a
                        href="/flats.html"
                        class="btn btn-outline"
                    >
                        Explore Properties
                    </a>

                </div>

            `;

            return;
        }


        // ---------------------------------------------------------
        // 5. Get flats
        // ---------------------------------------------------------

        const flatsRes = await fetch(
            '/api/flats',
            {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store'
            }
        );


        if (!flatsRes.ok) {

            throw new Error(
                `Failed to load properties (${flatsRes.status}).`
            );

        }


        const allFlats =
            await flatsRes.json();


        console.log(
            'All flats from API:',
            allFlats
        );


        if (!Array.isArray(allFlats)) {

            throw new Error(
                'Invalid properties response.'
            );

        }


        // ---------------------------------------------------------
        // 6. Filter owner's flats
        // ---------------------------------------------------------

        const myFlats =
            allFlats.filter(flat => {

                return (
                    Number(flat.OwnerId) ===
                    currentUserId
                );

            });


        console.log(
            'My flats:',
            myFlats
        );


        // ---------------------------------------------------------
        // 7. Get owner requests
        // ---------------------------------------------------------

        let requests = [];


        try {

            const reqRes =
                await fetch(
                    '/api/requests/owner',
                    {
                        method: 'GET',
                        credentials: 'include',
                        cache: 'no-store'
                    }
                );


            if (reqRes.ok) {

                const requestData =
                    await reqRes.json();


                if (Array.isArray(requestData)) {
                    requests = requestData;
                }

            } else {

                console.warn(
                    'Owner requests endpoint returned:',
                    reqRes.status
                );

            }

        } catch (requestError) {

            console.warn(
                'Could not load owner requests:',
                requestError
            );

        }


        // ---------------------------------------------------------
        // 8. Dashboard statistics
        // ---------------------------------------------------------

        const total =
            myFlats.length;


        const active =
            myFlats.filter(flat => {

                return (

                    flat.IsActive === true ||

                    flat.IsActive === 1 ||

                    String(
                        flat.IsActive
                    ).toLowerCase() === 'true'

                );

            }).length;


        const pendingRequests =
            requests.filter(request => {

                return (

                    String(
                        request.Status ??
                        request.status ??
                        ''
                    ).toLowerCase() ===
                    'pending'

                );

            }).length;


        // ---------------------------------------------------------
        // 9. Render dashboard
        // ---------------------------------------------------------

        dashboardContainer.innerHTML = `

            <!-- =================================================
                 DASHBOARD STATISTICS
            ================================================== -->

            <section class="owner-dashboard-stats">

                <div class="owner-stat-card">

                    <div class="owner-stat-icon">
                        <i class="fas fa-building"></i>
                    </div>

                    <div class="owner-stat-content">

                        <span class="owner-stat-number">
                            ${total}
                        </span>

                        <span class="owner-stat-label">
                            Total Properties
                        </span>

                    </div>

                </div>


                <div class="owner-stat-card">

                    <div class="owner-stat-icon">
                        <i class="fas fa-circle-check"></i>
                    </div>

                    <div class="owner-stat-content">

                        <span class="owner-stat-number">
                            ${active}
                        </span>

                        <span class="owner-stat-label">
                            Active Listings
                        </span>

                    </div>

                </div>


                <div class="owner-stat-card">

                    <div class="owner-stat-icon">
                        <i class="fas fa-envelope"></i>
                    </div>

                    <div class="owner-stat-content">

                        <span class="owner-stat-number">
                            ${pendingRequests}
                        </span>

                        <span class="owner-stat-label">
                            Pending Requests
                        </span>

                    </div>

                </div>

            </section>


            <!-- =================================================
                 MY PROPERTIES
            ================================================== -->

            <section class="owner-dashboard-section">

                <div class="owner-section-header">

                    <div class="owner-section-heading">

                        <span class="owner-section-eyebrow">
                            PROPERTY MANAGEMENT
                        </span>

                        <h2>
                            My Properties
                        </h2>

                        <p>
                            Manage your listed properties.
                        </p>

                    </div>


                    <a
                        href="/edit-flat.html"
                        class="btn btn-primary owner-add-property-btn"
                    >
                        <i class="fas fa-plus"></i>
                        Add Property
                    </a>

                </div>


                ${
                    myFlats.length > 0

                        ? `

                            <div class="owner-property-grid">

                                ${myFlats
                                    .map(renderPropertyCard)
                                    .join('')}

                            </div>

                        `

                        : `

                            <div class="owner-empty-state">

                                <div class="owner-empty-icon">
                                    <i class="fas fa-building"></i>
                                </div>

                                <h3>
                                    No Properties Yet
                                </h3>

                                <p>
                                    You haven't listed any properties yet.
                                    Start by adding your first property.
                                </p>

                                <a
                                    href="/edit-flat.html"
                                    class="btn btn-primary"
                                >
                                    <i class="fas fa-plus"></i>
                                    List Your First Property
                                </a>

                            </div>

                        `
                }

            </section>


            <!-- =================================================
                 PROPERTY REQUESTS
            ================================================== -->

            ${
                requests.length > 0

                    ? `

                        <section
                            class="owner-dashboard-section
                                   owner-requests-section"
                        >

                            <div class="owner-section-header">

                                <div class="owner-section-heading">

                                    <span class="owner-section-eyebrow">
                                        INQUIRIES
                                    </span>

                                    <h2>
                                        Property Requests
                                    </h2>

                                    <p>
                                        Requests from potential
                                        buyers or tenants.
                                    </p>

                                </div>

                            </div>


                            <div class="owner-requests-list">

                                ${requests
                                    .map(renderRequest)
                                    .join('')}

                            </div>

                        </section>

                    `

                    : ''
            }

        `;

    } catch (error) {

        console.error(
            'Dashboard loading error:',
            error
        );


        dashboardContainer.innerHTML = `

            <div
                class="owner-empty-state
                       owner-error-state"
            >

                <div class="owner-empty-icon">
                    <i class="fas fa-triangle-exclamation"></i>
                </div>

                <h3>
                    Unable to Load Dashboard
                </h3>

                <p>
                    ${escapeHtml(
                        error.message ||
                        'Something went wrong.'
                    )}
                </p>

                <button
                    type="button"
                    class="btn btn-primary"
                    onclick="loadDashboard()"
                >
                    <i class="fas fa-rotate-right"></i>
                    Try Again
                </button>

            </div>

        `;

    }

}


// ================================================================
// PROPERTY CARD
// ================================================================

function renderPropertyCard(flat) {

    // -------------------------------------------------------------
    // IMAGE
    // -------------------------------------------------------------

    const imageUrl =
        (flat.mainImage && fmUrl(flat.mainImage)) ||
        '/images/property-placeholder.jpg';


    // -------------------------------------------------------------
    // PURPOSE
    // -------------------------------------------------------------

    const purpose =
        flat.Purpose ||
        'Rent';


    // -------------------------------------------------------------
    // PRICE
    // -------------------------------------------------------------

    let priceDisplay = '';


    if (
        String(purpose).toLowerCase() === 'rent'
    ) {

        priceDisplay =
            `৳${Number(
                flat.Price || 0
            ).toLocaleString()} / ${escapeHtml(
                flat.RentPeriod || 'Monthly'
            )}`;

    } else {

        priceDisplay =
            `৳${Number(
                flat.Price || 0
            ).toLocaleString()}`;

    }


    // -------------------------------------------------------------
    // LOCATION
    // -------------------------------------------------------------

    const location =
        flat.City ||
        flat.AreaName ||
        flat.Address ||
        'Location not specified';


    // -------------------------------------------------------------
    // ACTIVE STATUS
    // -------------------------------------------------------------

    const active =

        flat.IsActive === true ||

        flat.IsActive === 1 ||

        String(
            flat.IsActive
        ).toLowerCase() === 'true';


    // -------------------------------------------------------------
    // PROPERTY ID
    // -------------------------------------------------------------

    const flatId =
        encodeURIComponent(flat.Id);


    // -------------------------------------------------------------
    // AREA
    // -------------------------------------------------------------

    const area =
        Number(
            flat.Area || 0
        ).toLocaleString();


    // -------------------------------------------------------------
    // CARD
    // -------------------------------------------------------------

    return `

        <article class="owner-property-card">


            <!-- =================================================
                 IMAGE
            ================================================== -->

            <div class="owner-property-image-wrapper">

                <img
                    src="${escapeHtml(imageUrl)}"
                    alt="${escapeHtml(
                        flat.Title ||
                        'Property'
                    )}"
                    class="owner-property-image"
                    loading="lazy"
                    onerror="
                        this.onerror=null;
                        this.src='/images/property-placeholder.jpg';
                    "
                >


                <div
                    class="owner-property-image-overlay"
                ></div>


                <!-- STATUS -->

                <span
                    class="owner-property-status ${
                        active
                            ? 'active'
                            : 'inactive'
                    }"
                >

                    <span
                        class="owner-status-dot"
                    ></span>

                    ${
                        !active
                            ? 'Inactive'
                            : (flat.AvailabilityStatus || 'Available')
                    }

                </span>


                <!-- PURPOSE -->

                <span
                    class="owner-property-purpose"
                >
                    ${escapeHtml(purpose)}
                </span>

            </div>


            <div style="padding:10px 14px;background:#fff;border-top:1px solid #eee;">
                <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:.82rem;font-weight:700;">
                    Availability
                    <select class="owner-availability-select" data-flat-id="${flatId}" onchange="updateFlatAvailability(${flatId}, this.value)" style="padding:7px 9px;border:1px solid #ddd;border-radius:6px;">
                        <option value="Available" ${String(flat.AvailabilityStatus || 'Available') === 'Available' ? 'selected' : ''}>Available</option>
                        <option value="Rented" ${String(flat.AvailabilityStatus) === 'Rented' ? 'selected' : ''}>Rented</option>
                        <option value="Sold" ${String(flat.AvailabilityStatus) === 'Sold' ? 'selected' : ''}>Sold</option>
                    </select>
                </label>
                <small style="display:block;margin-top:5px;opacity:.7;">Rented/Sold keeps the listing visible but disables requests, chat and email.</small>
            </div>

            <!-- =================================================
                 CONTENT
            ================================================== -->

            <div class="owner-property-content">


                <!-- PRICE -->

                <div class="owner-property-price">

                    ${priceDisplay}

                </div>


                <!-- TITLE -->

                <h3 class="owner-property-title">

                    ${escapeHtml(
                        flat.Title ||
                        'Untitled Property'
                    )}

                </h3>


                <!-- LOCATION -->

                <div class="owner-property-location">

                    <i class="fas fa-location-dot"></i>

                    <span>
                        ${escapeHtml(location)}
                    </span>

                </div>


                <!-- =================================================
                     PROPERTY DETAILS
                ================================================== -->

                <div class="owner-property-details">


                    <!-- BEDROOMS -->

                    <div class="owner-property-detail">

                        <i class="fas fa-bed"></i>

                        <span>
                            ${flat.Bedrooms || 0}
                        </span>

                        <small>
                            Beds
                        </small>

                    </div>


                    <!-- BATHROOMS -->

                    <div class="owner-property-detail">

                        <i class="fas fa-bath"></i>

                        <span>
                            ${flat.Bathrooms || 0}
                        </span>

                        <small>
                            Baths
                        </small>

                    </div>


                    <!-- AREA -->

                    <div class="owner-property-detail">

                        <i class="fas fa-ruler-combined"></i>

                        <span>
                            ${area}
                        </span>

                        <small>
                            ${escapeHtml(
                                flat.AreaUnit ||
                                'sq ft'
                            )}
                        </small>

                    </div>


                    <!-- FLOOR -->

                    <div class="owner-property-detail">

                        <i class="fas fa-layer-group"></i>

                        <span>
                            ${flat.Floor || '—'}
                        </span>

                        <small>
                            Floor
                        </small>

                    </div>


                </div>


                <!-- =================================================
                     ACTIONS
                ================================================== -->

                <div class="owner-property-actions">


                    <!-- VIEW -->

                    <a
                        href="/flat.html?id=${flatId}"
                        class="owner-property-btn
                               owner-view-btn"
                    >

                        <i class="fas fa-eye"></i>

                        <span>
                            View
                        </span>

                    </a>


                    <!-- EDIT -->

                    <a
                        href="/edit-flat.html?id=${flatId}"
                        class="owner-property-btn
                               owner-edit-btn"
                    >

                        <i class="fas fa-pen"></i>

                        <span>
                            Edit
                        </span>

                    </a>


                    <!-- DELETE — ICON ONLY -->

                    <button
                        type="button"
                        class="owner-delete-btn"
                        onclick="removeFlat(${Number(flat.Id)})"
                        title="Delete property"
                        aria-label="Delete property"
                    >

                        <i class="fas fa-trash"></i>

                    </button>


                </div>

            </div>

        </article>

    `;
}


// ================================================================
// REQUEST CARD
// ================================================================

function renderRequest(request) {

    const requestId =
        request.Id ??
        request.id;


    const userName =
        request.UserName ||
        request.Name ||
        request.userName ||
        'User';


    const flatTitle =
        request.FlatTitle ||
        request.Title ||
        'Property';


    const type =
        request.Type ||
        'Request';


    const status =
        request.Status ||
        'Pending';


    const normalizedStatus =
        String(status).toLowerCase();


    return `

        <article class="owner-request-card">


            <div class="owner-request-main">


                <div class="owner-request-icon">

                    <i class="fas fa-user"></i>

                </div>


                <div class="owner-request-content">

                    <p>

                        <strong>
                            ${escapeHtml(userName)}
                        </strong>

                        requested

                        <strong>
                            ${escapeHtml(type)}
                        </strong>

                        for

                        <strong>
                            ${escapeHtml(flatTitle)}
                        </strong>

                    </p>


                    <span
                        class="owner-request-status
                               status-${escapeHtml(status)}"
                    >

                        ${escapeHtml(status)}

                    </span>

                </div>

            </div>


            ${
                requestId &&
                normalizedStatus === 'pending'

                    ? `

                        <div class="owner-request-actions">

                            <button
                                type="button"
                                class="owner-request-btn
                                       owner-request-accept"
                                onclick="
                                    handleRequest(
                                        ${Number(requestId)},
                                        'Approved'
                                    )
                                "
                            >

                                <i class="fas fa-check"></i>

                                Accept

                            </button>


                            <button
                                type="button"
                                class="owner-request-btn
                                       owner-request-reject"
                                onclick="
                                    handleRequest(
                                        ${Number(requestId)},
                                        'Rejected'
                                    )
                                "
                            >

                                <i class="fas fa-xmark"></i>

                                Reject

                            </button>

                        </div>

                    `

                    : ''
            }

        </article>

    `;
}


// ================================================================
// DELETE PROPERTY
// ================================================================

window.removeFlat = async function (id) {

    if (!id) {

        alert(
            'Invalid property ID.'
        );

        return;
    }


    const confirmed =
        confirm(
            'Are you sure you want to remove this property?'
        );


    if (!confirmed) {
        return;
    }


    try {

        const response =
            await fetch(
                `/api/flats/${encodeURIComponent(id)}`,
                {
                    method: 'DELETE',
                    credentials: 'include'
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                'Failed to remove property.'
            );

        }


        await loadDashboard();


    } catch (error) {

        console.error(
            'Delete property error:',
            error
        );


        alert(
            error.message ||
            'Failed to remove property.'
        );

    }

};


// ================================================================
// AVAILABILITY STATUS
// ================================================================
window.updateFlatAvailability = async function (id, status) {
    try {
        const response = await fetch(`/api/flats/${encodeURIComponent(id)}/availability-status`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Could not update property status.');
        showToast(`Property marked ${String(status).toLowerCase()}.`);
        await loadDashboard();
    } catch (error) {
        console.error('Availability status error:', error);
        showToast(error.message || 'Could not update property status.', 'error');
        await loadDashboard();
    }
};

// ================================================================
// REQUEST ACTION
// ================================================================

window.handleRequest =
    async function (id, status) {

        if (!id) {
            return;
        }


        try {

            const response =
                await fetch(
                    `/api/requests/${encodeURIComponent(id)}`,
                    {
                        method: 'PUT',
                        credentials: 'include',

                        headers: {
                            'Content-Type':
                                'application/json'
                        },

                        body: JSON.stringify({
                            status
                        })
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    'Failed to update request.'
                );

            }


            await loadDashboard();


        } catch (error) {

            console.error(
                'Request update error:',
                error
            );


            alert(
                error.message ||
                'Failed to update request.'
            );

        }

    };


// ================================================================
// HTML ESCAPE
// ================================================================

function escapeHtml(value) {

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