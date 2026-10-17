const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedPhone = phone.replace(/[^0-9+]/g, "").slice(0, 15);
    if (!sanitizedPhone || sanitizedPhone.length < 7) {
      alert("Please enter a valid mobile phone number.");
      return;
    }

    const summaryString = `Category: ${category.toUpperCase()} | Takeaway: $${metrics.yourRealTakeawayCash.toFixed(2)} | Margin: ${metrics.yourRealKeepPercentagePct}%`;

    // Construct the direct prefilled Google Form submission URL
    const targetUrl = `${CONFIG.formActionUrl}?${CONFIG.phoneFieldKey}=${encodeURIComponent(sanitizedPhone)}&${CONFIG.payloadKey}=${encodeURIComponent(summaryString)}`;

    // Open the submission in a silent background image/beacon or hidden link to record it securely
    const beacon = new Image();
    beacon.src = targetUrl;

    // Instantly transition UI to success state and show Calendly link
    setIsSubmitted(true);
    setToastVisible(true);
  };
