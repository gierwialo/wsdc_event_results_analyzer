// Configuration constants
const CONFIG = {
    MAX_RPSS_ITERATIONS: 1000,
    SUCCESS_MESSAGE_TIMEOUT: 5000,
    ALLOWED_DOMAIN: 'scoring.dance',
    CORS_PROXY_URL: 'https://api.allorigins.win/raw?url=',
    DEV_MODE: false // Set to true to enable console logging
};

// Utility functions
const logger = {
    log: (...args) => CONFIG.DEV_MODE && console.log(...args),
    error: (...args) => console.error(...args),
    warn: (...args) => CONFIG.DEV_MODE && console.warn(...args)
};

const validateURL = (url) => {
    try {
        const urlObj = new URL(url);
        if (!urlObj.hostname.includes(CONFIG.ALLOWED_DOMAIN)) {
            throw new Error(`URL must be from ${CONFIG.ALLOWED_DOMAIN}`);
        }
        return true;
    } catch (e) {
        throw new Error('Invalid URL format');
    }
};

const sanitizeHTML = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

// RPSS Algorithm - Validation
const validateOrdinals = (ordinals, judge_ids, C) => {
    for (let j = 0; j < ordinals.length; j++) {
        const seen = new Set();
        for (let c = 0; c < C; c++) {
            const ord = ordinals[j][c];
            if (ord < 1 || ord > C || seen.has(ord)) {
                throw new Error(`Judge ${judge_ids[j]} has invalid ordinals (duplicates or out of range)`);
            }
            seen.add(ord);
        }
    }
};

// RPSS Algorithm - Find couples with majority at level k
const findMajorityWinners = (remaining, ordinals, k, majority) => {
    const counts = {};
    for (const c of remaining) {
        counts[c] = 0;
        for (let j = 0; j < ordinals.length; j++) {
            if (ordinals[j][c] <= k) {
                counts[c]++;
            }
        }
    }

    const eligible = [];
    for (const c of remaining) {
        if (counts[c] >= majority) {
            eligible.push(c);
        }
    }

    return { counts, eligible };
};

// RPSS Algorithm - Calculate sum of ordinals <= k
const calculateSums = (tier, ordinals, k) => {
    const sums = {};
    for (const c of tier) {
        const ordsForC = [];
        for (let j = 0; j < ordinals.length; j++) {
            if (ordinals[j][c] <= k) {
                ordsForC.push(ordinals[j][c]);
            }
        }
        sums[c] = ordsForC.reduce((a, b) => a + b, 0);
    }
    return sums;
};

// RPSS Algorithm - Head to head comparison
const headToHeadWinner = (c1, c2, ordinals, majority) => {
    let c1_wins = 0;
    for (let j = 0; j < ordinals.length; j++) {
        if (ordinals[j][c1] < ordinals[j][c2]) {
            c1_wins++;
        }
    }
    return c1_wins >= majority ? c1 : c2;
};

// RPSS Algorithm - Main function
const compute_relative_placement = (ordinals, couple_ids, judge_ids) => {
    if (!ordinals || ordinals.length === 0 || !ordinals[0]) {
        throw new Error('Invalid ordinals data');
    }

    const J = ordinals.length;
    const C = ordinals[0].length;

    validateOrdinals(ordinals, judge_ids, C);

    const majority = Math.floor(J / 2) + 1;
    const placements = [];
    const audit = { majority, steps: [], totalJudges: J, totalCouples: C };
    const remaining = new Set([...Array(C).keys()]);
    let place = 1;
    let iteration = 0;
    let stepNumber = 1;

    audit.steps.push({
        step: stepNumber++,
        type: 'init',
        message: `Starting RPSS calculation with ${J} judges and ${C} couples. Majority = ${majority}`
    });

    while (remaining.size > 0 && iteration < CONFIG.MAX_RPSS_ITERATIONS) {
        iteration++;
        let k = 1;
        let assigned_at_this_level = false;

        audit.steps.push({
            step: stepNumber++,
            type: 'iteration',
            message: `Starting iteration for place ${place}. Remaining couples: ${Array.from(remaining).map(c => couple_ids[c]).join(', ')}`
        });

        while (k <= C) {
            const { counts, eligible } = findMajorityWinners(remaining, ordinals, k, majority);

            audit.steps.push({
                step: stepNumber++,
                type: 'check',
                k: k,
                counts: {...counts},
                eligible: eligible.map(c => couple_ids[c]),
                message: `Checking k=${k}: ${eligible.length > 0 ? `${eligible.length} couple(s) have majority` : 'No couples have majority yet'}`
            });

            if (eligible.length === 0) {
                k++;
                continue;
            }

            const maxCount = Math.max(...eligible.map(c => counts[c]));
            const tier = eligible.filter(c => counts[c] === maxCount);

            if (tier.length === 1) {
                const c = tier[0];
                audit.steps.push({
                    step: stepNumber++,
                    type: 'assign',
                    place: place,
                    couple: couple_ids[c],
                    k: k,
                    majorityCount: maxCount,
                    message: `✓ Assigned place ${place} to ${couple_ids[c]} (majority: ${maxCount}/${J} at k≤${k})`
                });
                placements.push({
                    place: place++,
                    couple_id: couple_ids[c],
                    couple_index: c,
                    k_used: k,
                    majority_count: maxCount
                });
                remaining.delete(c);
                assigned_at_this_level = true;

                const stillEligible = [];
                for (const c2 of remaining) {
                    if (counts[c2] >= majority) {
                        stillEligible.push(c2);
                    }
                }
                if (stillEligible.length > 0) {
                    continue;
                } else {
                    break;
                }
            } else {
                // Tie-break
                audit.steps.push({
                    step: stepNumber++,
                    type: 'tie',
                    couples: tier.map(c => couple_ids[c]),
                    message: `⚠ Tie between ${tier.length} couples: ${tier.map(c => couple_ids[c]).join(', ')}. Using sum of ordinals ≤${k} to break tie.`
                });

                const sums = calculateSums(tier, ordinals, k);
                const bestSum = Math.min(...tier.map(c => sums[c]));
                const tied2 = tier.filter(c => sums[c] === bestSum);

                const sumsInfo = tier.map(c => `${couple_ids[c]}: sum=${sums[c]}`).join(', ');
                audit.steps.push({
                    step: stepNumber++,
                    type: 'tie-sums',
                    sums: Object.fromEntries(tier.map(c => [couple_ids[c], sums[c]])),
                    message: `Ordinal sums at k≤${k}: ${sumsInfo}`
                });

                if (tied2.length === 1) {
                    const c = tied2[0];
                    audit.steps.push({
                        step: stepNumber++,
                        type: 'assign',
                        place: place,
                        couple: couple_ids[c],
                        k: k,
                        majorityCount: maxCount,
                        sum: sums[c],
                        message: `✓ Assigned place ${place} to ${couple_ids[c]} (sum: ${sums[c]}, best among tied)`
                    });
                    placements.push({
                        place: place++,
                        couple_id: couple_ids[c],
                        couple_index: c,
                        k_used: k,
                        majority_count: maxCount,
                        sum_used: sums[c]
                    });
                    remaining.delete(c);
                    assigned_at_this_level = true;
                    continue;
                } else {
                    // Expand k
                    let k2 = k + 1;
                    let resolved = false;

                    while (k2 <= C && !resolved) {
                        const { counts: counts2 } = findMajorityWinners(new Set(tied2), ordinals, k2, majority);
                        const maxCount2 = Math.max(...tied2.map(c => counts2[c]));
                        const tied3 = tied2.filter(c => counts2[c] === maxCount2);

                        if (tied3.length === 1) {
                            const c = tied3[0];
                            placements.push({
                                place: place++,
                                couple_id: couple_ids[c],
                                couple_index: c,
                                k_used: k2,
                                majority_count: maxCount2,
                                tiebreak: 'expanded_k'
                            });
                            remaining.delete(c);
                            resolved = true;
                            assigned_at_this_level = true;
                            break;
                        }

                        if (k2 === C) {
                            if (tied3.length === 2) {
                                const [c1, c2] = tied3;
                                const winner = headToHeadWinner(c1, c2, ordinals, majority);
                                const loser = winner === c1 ? c2 : c1;

                                placements.push({
                                    place: place++,
                                    couple_id: couple_ids[winner],
                                    couple_index: winner,
                                    k_used: C,
                                    majority_count: maxCount2,
                                    tiebreak: 'head_to_head'
                                });
                                remaining.delete(winner);

                                if (remaining.has(loser)) {
                                    placements.push({
                                        place: place++,
                                        couple_id: couple_ids[loser],
                                        couple_index: loser,
                                        k_used: C,
                                        majority_count: counts2[loser],
                                        tiebreak: 'head_to_head_loser'
                                    });
                                    remaining.delete(loser);
                                }
                            } else {
                                // Multiway tie
                                for (const c of tied3) {
                                    placements.push({
                                        place: place,
                                        couple_id: couple_ids[c],
                                        couple_index: c,
                                        k_used: C,
                                        majority_count: maxCount2,
                                        tiebreak: 'unresolved_multiway'
                                    });
                                    remaining.delete(c);
                                }
                                place += tied3.length;
                            }
                            resolved = true;
                            assigned_at_this_level = true;
                            break;
                        }
                        k2++;
                    }

                    if (resolved) {
                        break;
                    } else {
                        logger.warn('RPSS: Could not resolve tie, assigning all to same place', tied2);
                        for (const c of tied2) {
                            placements.push({
                                place: place,
                                couple_id: couple_ids[c],
                                couple_index: c,
                                k_used: k,
                                majority_count: maxCount,
                                tiebreak: 'unresolved'
                            });
                            remaining.delete(c);
                        }
                        place += tied2.length;
                        assigned_at_this_level = true;
                        break;
                    }
                }
            }

            if (assigned_at_this_level) {
                break;
            }
        }

        if (!assigned_at_this_level && remaining.size > 0) {
            logger.error('RPSS: Could not assign any couple at this iteration');
            for (const c of remaining) {
                placements.push({
                    place: place++,
                    couple_id: couple_ids[c],
                    couple_index: c,
                    k_used: C,
                    majority_count: 0,
                    tiebreak: 'emergency_assignment'
                });
            }
            break;
        }
    }

    if (iteration >= CONFIG.MAX_RPSS_ITERATIONS) {
        logger.error('RPSS: Max iterations exceeded');
    }

    return { placements, audit };
};

// Data parsing functions
const parseEventData = (eventData, judgesSet) => {
    const locationParts = [];
    if (eventData.location?.name) locationParts.push(eventData.location.name);
    if (eventData.location?.country) locationParts.push(eventData.location.country);

    return {
        name: eventData.name || '',
        category: eventData.category || eventData.division || '',
        date: eventData.startDate ? new Date(eventData.startDate).toLocaleDateString('en-US') : '',
        location: locationParts.join(', '),
        judges: Array.from(judgesSet).join(', '),
        calculationModel: eventData.calculation_model || eventData.result[0]?.calculation_model || ''
    };
};

const parseResults = (eventData) => {
    return eventData.result.map((result, index) => {
        const scores = {};
        if (result.scores) {
            result.scores.forEach(score => {
                scores[score.name] = score.placement;
            });
        }

        return {
            place: result.placement,
            leader: result.dancer?.leader?.fullname || '',
            leaderBib: result.dancer?.leader?.bib || '',
            follower: result.dancer?.follower?.fullname || '',
            followerBib: result.dancer?.follower?.bib || '',
            scores: scores,
            originalIndex: index  // Track original position for ordinals mapping
        };
    });
};

const calculateRPSS = (results, judges) => {
    const C = results.length;
    const J = judges.length;

    // Sort by originalIndex to maintain consistent couple_ids order
    const sortedByOriginal = [...results].sort((a, b) => a.originalIndex - b.originalIndex);

    const couple_ids = sortedByOriginal.map(r => `${r.leaderBib}/${r.followerBib}`);
    const ordinals = [];

    for (let j = 0; j < J; j++) {
        const judgeName = judges[j];
        const judgeOrdinals = [];
        for (let c = 0; c < C; c++) {
            const placement = parseInt(sortedByOriginal[c].scores[judgeName]);
            if (isNaN(placement)) {
                throw new Error(`Invalid placement for judge ${judgeName}, couple ${c}`);
            }
            judgeOrdinals.push(placement);
        }
        ordinals.push(judgeOrdinals);
    }

    logger.log('Calling RPSS with ordinals:', ordinals);
    const rpssResult = compute_relative_placement(ordinals, couple_ids, judges);
    logger.log('RPSS calculation completed:', rpssResult);

    return rpssResult;
};

const mapCalculatedPlaces = (results, rpssResult, hasModifications = false) => {
    const calcPlaceMap = {};
    rpssResult.placements.forEach(p => {
        calcPlaceMap[p.couple_id] = {
            place: p.place,
            k_used: p.k_used,
            majority_count: p.majority_count,
            sum_used: p.sum_used,
            tiebreak: p.tiebreak
        };
    });

    results.forEach(result => {
        const coupleId = `${result.leaderBib}/${result.followerBib}`;
        const calcData = calcPlaceMap[coupleId];
        if (calcData) {
            result.calculatedPlace = calcData.place;

            const details = [];
            details.push(`k=${calcData.k_used}`);
            details.push(`maj=${calcData.majority_count}`);
            if (calcData.sum_used) {
                details.push(`sum=${calcData.sum_used}`);
            }
            if (calcData.tiebreak) {
                details.push(calcData.tiebreak);
            }
            result.calcDetails = details.join(', ');
        } else {
            result.calculatedPlace = '?';
            result.calcDetails = 'error';
        }

        // Add computed values for performance
        updateResultComputedValues(result, hasModifications);
    });
};

// Update computed values for a result object (performance optimization)
const updateResultComputedValues = (result, hasModifications) => {
    // Row class
    if (hasModifications) {
        if (result.calculatedPlace < result.place) {
            result._rowClass = 'row-improved';
        } else if (result.calculatedPlace > result.place) {
            result._rowClass = 'row-worsened';
        } else {
            result._rowClass = '';
        }
    } else {
        result._rowClass = '';
    }

    // Place class
    if (!result.calculatedPlace) {
        result._placeClass = '';
    } else if (hasModifications) {
        if (result.calculatedPlace < result.place) {
            result._placeClass = 'place-improved';
        } else if (result.calculatedPlace > result.place) {
            result._placeClass = 'place-worsened';
        } else {
            result._placeClass = result.calculatedPlace === result.place ? 'place-match' : 'place-mismatch';
        }
    } else {
        result._placeClass = result.calculatedPlace === result.place ? 'place-match' : 'place-mismatch';
    }

    // Place title
    if (!result.calculatedPlace) {
        result._placeTitle = '';
    } else if (hasModifications) {
        if (result.calculatedPlace < result.place) {
            result._placeTitle = 'Improved (moved up)';
        } else if (result.calculatedPlace > result.place) {
            result._placeTitle = 'Worsened (moved down)';
        } else {
            result._placeTitle = result.calculatedPlace === result.place ? 'Match' : 'Mismatch';
        }
    } else {
        result._placeTitle = result.calculatedPlace === result.place ? 'Match' : 'Mismatch';
    }
};

// Alpine.js data
document.addEventListener('alpine:init', () => {
    Alpine.data('resultsAnalyzer', () => ({
        url: localStorage.getItem('wsdc_last_url') || '',
        loading: false,
        error: '',
        successMessage: '',
        results: null,
        eventInfo: null,
        judges: [],
        successTimeout: null,
        auditTrail: null,
        auditInfo: null,
        calculatingRPSS: false,

        // Editable scores state
        originalOrdinals: null,      // Backup of original ordinals [judge][couple]
        currentOrdinals: null,       // Current (possibly modified) ordinals [judge][couple]
        modifiedCells: new Set(),    // Track which cells are modified "judgeIdx-coupleIdx"
        hasModifications: false,     // Flag if any modifications exist
        advancedMode: false,         // Advanced mode: no smart swap, manual validation
        invalidJudges: new Set(),    // Track judge indices with validation errors

        // Check if cell is modified
        isModified(judgeIdx, coupleIdx) {
            return this.modifiedCells.has(`${judgeIdx}-${coupleIdx}`);
        },

        // Get current score for judge and couple
        getCurrentScore(judgeIdx, coupleIdx) {
            if (!this.currentOrdinals) return '-';
            return this.currentOrdinals[judgeIdx]?.[coupleIdx] || '-';
        },

        // Check if judge column has validation errors
        isJudgeInvalid(judgeIdx) {
            return this.invalidJudges.has(judgeIdx);
        },

        // Toggle advanced mode
        toggleAdvancedMode() {
            this.advancedMode = !this.advancedMode;
            this.error = null; // Clear any validation errors when switching modes
            this.invalidJudges.clear(); // Clear invalid judge highlights
        },

        // Handle score change with smart swap (or manual in advanced mode)
        handleScoreChange(judgeIdx, coupleIdx, event) {
            const newValue = parseInt(event.target.value);
            const oldValue = this.currentOrdinals[judgeIdx][coupleIdx];

            if (isNaN(newValue) || newValue === oldValue) return;

            if (this.advancedMode) {
                // Advanced mode: just update the value, no smart swap
                this.currentOrdinals[judgeIdx][coupleIdx] = newValue;
                this.modifiedCells.add(`${judgeIdx}-${coupleIdx}`);
            } else {
                // Simple mode: smart swap
                // Find couple that currently has newValue
                const swapCoupleIdx = this.currentOrdinals[judgeIdx].findIndex(
                    (score, idx) => score === newValue && idx !== coupleIdx
                );

                if (swapCoupleIdx !== -1) {
                    // Swap: current couple gets newValue, other gets oldValue
                    this.currentOrdinals[judgeIdx][coupleIdx] = newValue;
                    this.currentOrdinals[judgeIdx][swapCoupleIdx] = oldValue;

                    // Mark both as modified
                    this.modifiedCells.add(`${judgeIdx}-${coupleIdx}`);
                    this.modifiedCells.add(`${judgeIdx}-${swapCoupleIdx}`);
                } else {
                    // Just update (shouldn't happen with proper validation)
                    this.currentOrdinals[judgeIdx][coupleIdx] = newValue;
                    this.modifiedCells.add(`${judgeIdx}-${coupleIdx}`);
                }
            }

            this.hasModifications = true;
        },

        // Validate ordinals (each judge must have unique values 1..C)
        validateOrdinals() {
            const C = this.results.length;
            const J = this.judges.length;
            const invalidJudgeIndices = [];
            const errors = [];

            for (let j = 0; j < J; j++) {
                const judgeOrdinals = this.currentOrdinals[j];
                const values = new Set(judgeOrdinals);
                let judgeHasError = false;

                // Check if we have exactly C unique values
                if (values.size !== C) {
                    errors.push(`Judge ${this.judges[j]}: Found ${values.size} unique values, expected ${C}`);
                    judgeHasError = true;
                }

                // Check if all values are in range 1..C
                if (!judgeHasError) {
                    for (let i = 1; i <= C; i++) {
                        if (!judgeOrdinals.includes(i)) {
                            errors.push(`Judge ${this.judges[j]}: Missing value ${i}`);
                            judgeHasError = true;
                            break;
                        }
                    }
                }

                if (judgeHasError) {
                    invalidJudgeIndices.push(j);
                }
            }

            if (invalidJudgeIndices.length > 0) {
                return {
                    valid: false,
                    message: errors.join('; '),
                    invalidJudges: invalidJudgeIndices
                };
            }

            return { valid: true, invalidJudges: [] };
        },

        // Recalculate RPSS with current ordinals
        async recalculate(force = false) {
            if (!force && !this.hasModifications) return;

            try {
                // Validate ordinals if in advanced mode
                if (this.advancedMode) {
                    const validation = this.validateOrdinals();
                    if (!validation.valid) {
                        this.error = 'Invalid ordinals: ' + validation.message;
                        // Mark invalid judge columns
                        this.invalidJudges.clear();
                        validation.invalidJudges.forEach(j => this.invalidJudges.add(j));
                        return;
                    }
                    // Clear invalid judges on successful validation
                    this.invalidJudges.clear();
                }

                this.calculatingRPSS = true;
                this.error = null; // Clear any previous errors
                await new Promise(resolve => setTimeout(resolve, 50));

                // Build couple_ids from results in original order (by originalIndex)
                const couple_ids = [];
                const sortedByOriginal = [...this.results].sort((a, b) => a.originalIndex - b.originalIndex);
                sortedByOriginal.forEach(r => {
                    couple_ids.push(`${r.leaderBib}/${r.followerBib}`);
                });

                // Call RPSS with current ordinals
                const rpssResult = compute_relative_placement(
                    this.currentOrdinals,
                    couple_ids,
                    this.judges
                );

                // Map calculated places with performance optimizations
                mapCalculatedPlaces(this.results, rpssResult, this.hasModifications || force);

                // Update audit trail
                this.auditTrail = rpssResult.audit.steps;
                this.auditInfo = {
                    majority: rpssResult.audit.majority,
                    totalJudges: rpssResult.audit.totalJudges,
                    totalCouples: rpssResult.audit.totalCouples
                };

                // Sort results by calculated place for visual reordering
                this.results.sort((a, b) => a.calculatedPlace - b.calculatedPlace);

            } catch (error) {
                logger.error('Recalculation error:', error);
                this.error = 'Error recalculating placements: ' + error.message;
            } finally {
                this.calculatingRPSS = false;
            }
        },

        // Reset to original values
        async reset() {
            if (!this.originalOrdinals) return;

            // Deep copy original ordinals
            this.currentOrdinals = JSON.parse(JSON.stringify(this.originalOrdinals));
            this.modifiedCells.clear();
            this.hasModifications = false;
            this.error = null; // Clear any validation errors
            this.invalidJudges.clear(); // Clear invalid judge highlights

            // Recalculate with original data (force=true)
            await this.recalculate(true);

            // Sort back to original order (by original place)
            this.results.sort((a, b) => a.place - b.place);
        },

        async loadResults() {
            if (!this.url) return;

            // Clear previous messages
            this.error = '';
            this.successMessage = '';
            if (this.successTimeout) {
                clearTimeout(this.successTimeout);
            }

            // Validate URL
            try {
                validateURL(this.url);
            } catch (e) {
                this.error = e.message;
                return;
            }

            this.loading = true;
            this.results = null;
            this.eventInfo = null;
            this.auditTrail = null;
            this.auditInfo = null;

            logger.log('Starting to load results from:', this.url);

            try {
                // Fetch data
                let html;
                try {
                    logger.log('Fetching directly...');
                    const response = await fetch(this.url);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    html = await response.text();
                    logger.log('Direct fetch successful');
                } catch (corsError) {
                    logger.log('Direct fetch failed, using proxy...');
                    const proxyUrl = `${CONFIG.CORS_PROXY_URL}${encodeURIComponent(this.url)}`;
                    const response = await fetch(proxyUrl);
                    if (!response.ok) {
                        throw new Error('Unable to fetch data. Please check the URL or try again later.');
                    }
                    html = await response.text();
                    logger.log('Proxy fetch successful');
                }

                // Parse HTML
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                // Look for JSON-LD with results
                const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
                let eventData = null;

                scripts.forEach(script => {
                    try {
                        const data = JSON.parse(script.textContent);
                        if (data['@type'] === 'Event' && data.result && Array.isArray(data.result)) {
                            eventData = data;
                        }
                    } catch (e) {
                        logger.error('Error parsing JSON-LD:', e);
                    }
                });

                if (!eventData || !eventData.result || eventData.result.length === 0) {
                    throw new Error('No results data found on the page. Please ensure this is a valid results page.');
                }

                // Collect judges
                const judgesSet = new Set();
                if (eventData.result[0]?.scores) {
                    eventData.result[0].scores.forEach(score => {
                        judgesSet.add(score.name);
                    });
                }
                this.judges = Array.from(judgesSet);

                // Parse event info
                this.eventInfo = parseEventData(eventData, judgesSet);

                // Parse results
                this.results = parseResults(eventData);
                this.results.sort((a, b) => a.place - b.place);

                // Calculate RPSS placements
                try {
                    this.calculatingRPSS = true;
                    logger.log('Starting RPSS calculation...');

                    // Small delay to allow UI to update
                    await new Promise(resolve => setTimeout(resolve, 50));

                    const rpssResult = calculateRPSS(this.results, this.judges);
                    mapCalculatedPlaces(this.results, rpssResult, false);

                    // Store audit trail for step-by-step breakdown
                    this.auditTrail = rpssResult.audit.steps;
                    this.auditInfo = {
                        majority: rpssResult.audit.majority,
                        totalJudges: rpssResult.audit.totalJudges,
                        totalCouples: rpssResult.audit.totalCouples
                    };

                    // Initialize ordinals for editable scores
                    const C = this.results.length;
                    const J = this.judges.length;
                    const ordinals = [];

                    for (let j = 0; j < J; j++) {
                        const judgeName = this.judges[j];
                        const judgeOrdinals = new Array(C);

                        // Use originalIndex to maintain consistent mapping
                        this.results.forEach(result => {
                            const placement = parseInt(result.scores[judgeName]);
                            judgeOrdinals[result.originalIndex] = placement;
                        });

                        ordinals.push(judgeOrdinals);
                    }

                    // Store original and current ordinals
                    this.originalOrdinals = JSON.parse(JSON.stringify(ordinals));
                    this.currentOrdinals = JSON.parse(JSON.stringify(ordinals));
                    this.modifiedCells.clear();
                    this.hasModifications = false;
                } catch (rpssError) {
                    logger.error('RPSS calculation error:', rpssError);
                    this.results.forEach(result => {
                        result.calculatedPlace = 'ERR';
                        result.calcDetails = 'Calculation error';
                    });
                    this.auditTrail = null;
                    this.auditInfo = null;
                } finally {
                    this.calculatingRPSS = false;
                }

                this.successMessage = `Successfully loaded ${this.results.length} results!`;

                // Save URL to localStorage for next visit
                localStorage.setItem('wsdc_last_url', this.url);

                // Auto-hide success message after 5 seconds
                this.successTimeout = setTimeout(() => {
                    this.successMessage = '';
                }, CONFIG.SUCCESS_MESSAGE_TIMEOUT);

            } catch (err) {
                // User-friendly error messages
                let errorMessage = 'An error occurred while loading results. ';

                if (err.message.includes('fetch')) {
                    errorMessage += 'Unable to connect to the server. Please check your internet connection.';
                } else if (err.message.includes('No results data')) {
                    errorMessage = err.message;
                } else {
                    errorMessage += err.message;
                }

                this.error = errorMessage;
                logger.error('Error loading results:', err);
            } finally {
                this.loading = false;
            }
        }
    }));
});
