(function () {
    'use strict';

    const form = document.getElementById('contactForm');

    if (!form) {
        return;
    }

    const submitButton =
        document.getElementById('contactSubmitBtn');

    form.addEventListener('submit', async function (event) {
        event.preventDefault();

        const formData = new FormData(form);

        const payload = {
            name: formData.get('name')?.trim(),
            email: formData.get('email')?.trim(),
            phone: formData.get('phone')?.trim(),
            subject: formData.get('subject')?.trim(),
            message: formData.get('message')?.trim()
        };

        if (!payload.name || !payload.email || !payload.message) {
            showToast(
                'Please complete all required fields.',
                'error'
            );

            return;
        }

        const originalButtonHTML = submitButton.innerHTML;

        submitButton.disabled = true;

        submitButton.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            Sending...
        `;

        try {
            const response = await fetch('/api/contact', {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error ||
                    'Failed to send message'
                );
            }

            showToast(
                'Your message has been sent successfully.',
                'success'
            );

            form.reset();

        } catch (error) {

            console.error(
                'Contact submission error:',
                error
            );

            showToast(
                error.message ||
                'Unable to send your message.',
                'error'
            );

        } finally {

            submitButton.disabled = false;

            submitButton.innerHTML =
                originalButtonHTML;
        }
    });

})();