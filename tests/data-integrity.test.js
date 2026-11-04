const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function routesFor(file, pool) {
    const routes = {};
    const router = {};
    for (const method of ['get', 'post', 'put', 'delete']) {
        router[method] = (url, handler) => { routes[method + ' ' + url] = handler; };
    }
    const context = {
        module: { exports: {} }, console: { error() {} },
        require(name) {
            if (name === 'express') return { Router: () => router };
            if (name === '../config/db') return pool;
            throw new Error('Unexpected dependency: ' + name);
        }
    };
    vm.runInNewContext(read(file), context, { filename: file });
    return routes;
}

async function request(handler, body = {}, params = { id: '1' }, query = {}) {
    const response = {
        code: 200,
        status(code) { this.code = code; return this; },
        json(data) { this.data = data; return this; },
        setHeader() {}
    };
    await handler({ body, params, query }, response);
    return response;
}

function database(containerCount = 3) {
    let state = {
        bookings: [{ id: 1, booking_no: 'BK-OLD', run_date: '2026-10-31', mode: 'EXPORT', container_count: containerCount, trip_fee: 100, trans_fee: 200 }],
        shipments: [1, 2, 3].map(n => ({ order_id: 'ORD-261031-00' + n, booking_no: 'BK-OLD' })),
        financials: [1, 2, 3].map(n => ({ order_id: 'ORD-261031-00' + n, trip_fee: 100, trans_fee: 200 }))
    };
    let snapshot;
    const queries = [];
    const query = async (raw, values = []) => {
        const sql = raw.replace(/\s+/g, ' ').trim();
        queries.push(sql);
        const result = rows => ({ rows, rowCount: rows.length });
        if (sql === 'BEGIN') { snapshot = structuredClone(state); return result([]); }
        if (sql === 'ROLLBACK') { state = snapshot; return result([]); }
        if (sql === 'COMMIT' || sql.startsWith('SELECT pg_advisory')) return result([]);
        if (sql.startsWith('SELECT * FROM bookings')) {
            return result(state.bookings.filter(b => sql.includes('WHERE id =') ? String(b.id) === String(values[0]) : b.booking_no === values[0]));
        }
        if (sql.startsWith('SELECT id FROM bookings')) return result(state.bookings.filter(b => b.booking_no === values[0]));
        if (sql.startsWith('SELECT id FROM customers')) return result([{ id: 7 }]);
        if (sql.startsWith('SELECT order_id FROM shipment_operations WHERE booking_no')) {
            return result(state.shipments.filter(s => s.booking_no === values[0]));
        }
        if (sql.startsWith('SELECT order_id FROM shipment_operations WHERE order_id LIKE')) {
            const matches = state.shipments.filter(s => s.order_id.startsWith(values[0].slice(0, -1))).sort((a, b) => b.order_id.localeCompare(a.order_id));
            return result(matches.slice(0, 1));
        }
        if (sql.startsWith('SELECT s.*')) return result(state.shipments);
        if (sql.startsWith('INSERT INTO bookings')) {
            let booking = state.bookings.find(b => b.booking_no === values[0]);
            if (!booking) {
                booking = { id: state.bookings.length + 1, booking_no: values[0] };
                state.bookings.push(booking);
            }
            Object.assign(booking, { mode: values[1], run_date: values[2], job_name: values[3], container_count: values[5] });
            if (values[23]) booking.trip_fee = values[20];
            if (values[24]) booking.trans_fee = values[21];
            if (values[25]) booking.demurrage = values[15];
            return result([booking]);
        }
        if (sql.startsWith('UPDATE bookings SET container_count = container_count + 1')) {
            state.bookings.find(b => b.booking_no === values[0]).container_count++;
            return result([]);
        }
        if (sql.startsWith('UPDATE bookings SET')) {
            const booking = state.bookings.find(b => b.id === values[values.length - 1]);
            for (const match of sql.matchAll(/(\w+) = \$(\d+)/g)) {
                if (match[1] !== 'id') booking[match[1]] = values[Number(match[2]) - 1];
            }
            return result([booking]);
        }
        if (sql.startsWith('INSERT INTO shipment_operations')) {
            state.shipments.push({ order_id: values[0], booking_no: values[1] });
            return result([]);
        }
        if (sql.startsWith('INSERT INTO financials')) {
            state.financials.push({ order_id: values[0], trip_fee: values[1], trans_fee: values[2] });
            return result([]);
        }
        if (sql.startsWith('UPDATE shipment_operations')) return result([]);
        if (sql.startsWith('UPDATE financials')) {
            const row = state.financials.find(f => f.order_id === values[8]);
            const fields = ['trip_fee', 'trans_fee', 'port_pass_fee', 'shore_fee', 'lift_fee', 'deposit_fee', 'advance_fee', 'other_expense'];
            fields.forEach((field, i) => { if (values[i + 9]) row[field] = values[i]; });
            return result([row]);
        }
        throw new Error('Unexpected SQL in mock: ' + sql);
    };
    return {
        query, connect: async () => ({ query, release() {} }), queries,
        state: () => structuredClone(state)
    };
}

test('dispatch and Monitor GET is read-only even when counts do not match', async () => {
    const db = database(8);
    const routes = routesFor('routes/bookings.js', db);
    const before = db.state();
    for (let i = 0; i < 2; i++) {
        const response = await request(routes['get /shipments'], {}, {}, { year: '2026', month: '10' });
        assert.equal(response.data.success, true);
    }
    assert.deepEqual(db.state(), before);
    assert.ok(db.queries.every(sql => sql.startsWith('SELECT s.*')));
    assert.match(read('public/booking-monitor.html'), /fetch\(`\/api\/shipments/);
});

test('PUT without count preserves Orders, financials, count and omitted prices', async () => {
    const db = database();
    const response = await request(routesFor('routes/bookings.js', db)['put /bookings/:id'], { job_name: 'Updated' });
    assert.equal(response.code, 200);
    assert.equal(db.state().bookings[0].container_count, 3);
    assert.equal(db.state().bookings[0].trip_fee, 100);
    assert.equal(db.state().shipments.length, 3);
    assert.equal(db.state().financials.length, 3);
    assert.ok(!db.queries.some(sql => sql.includes('INSERT INTO shipment_operations')));
});

test('PUT and POST upsert refuse reduction and roll back every field', async () => {
    for (const endpoint of ['put /bookings/:id', 'post /bookings/header']) {
        const db = database();
        const before = db.state();
        const response = await request(routesFor('routes/bookings.js', db)[endpoint], {
            booking_no: 'BK-OLD', mode: 'EXPORT', run_date: '2026-10-31', container_count: 2, trip_fee: 999
        });
        assert.equal(response.code, 409);
        assert.deepEqual(db.state(), before);
        assert.ok(db.queries.includes('ROLLBACK'));
        assert.ok(!db.queries.some(sql => sql.startsWith('DELETE')));
    }
});

test('sync rejects a target below existing Orders and rolls back header updates', async () => {
    const db = database();
    const before = db.state();
    // Simulate a legacy inconsistency without touching real data.
    const originalQuery = db.query;
    db.connect = async () => ({ release() {}, query: async (sql, values) => {
        const result = await originalQuery(sql, values);
        if (sql.startsWith('SELECT order_id FROM shipment_operations WHERE booking_no')) result.rows.push({ order_id: 'ORD-EXTRA' });
        return result;
    } });
    const response = await request(routesFor('routes/bookings.js', db)['put /bookings/:id'], { container_count: 3, trip_fee: 999 });
    assert.equal(response.code, 409);
    assert.deepEqual(db.state(), before);
});

test('create Booking and increase count create matching Order and finance rows', async () => {
    const db = database();
    const routes = routesFor('routes/bookings.js', db);
    let response = await request(routes['post /bookings/header'], {
        booking_no: 'BK-NEW', mode: 'EXPORT', run_date: '2026-11-04', container_count: 2, trip_fee: 500, trans_fee: 700
    });
    assert.equal(response.code, 200);
    assert.equal(db.state().shipments.filter(s => s.booking_no === 'BK-NEW').length, 2);
    assert.equal(db.state().financials.filter(f => f.trip_fee === 500).length, 2);
    response = await request(routes['put /bookings/:id'], { container_count: 3 }, { id: '2' });
    assert.equal(response.code, 200);
    assert.equal(db.state().shipments.filter(s => s.booking_no === 'BK-NEW').length, 3);
});

test('add Order through dispatch save still works and omitted prices stay unchanged', async () => {
    const db = database();
    const routes = routesFor('routes/bookings.js', db);
    let response = await request(routes['post /shipments'], { data: [{ order_id: 'ORD-ADD-1', booking_no: 'BK-OLD', trip_fee: 50, trans_fee: 60 }] });
    assert.equal(response.code, 200);
    assert.equal(db.state().bookings[0].container_count, 4);
    assert.equal(db.state().shipments.length, 4);
    response = await request(routes['post /shipments'], { data: [{ order_id: 'ORD-261031-001', container_1_no: 'TEST' }] });
    assert.equal(response.code, 200);
    assert.equal(db.state().financials[0].trip_fee, 100);
});

test('price zero, null and omission are distinct for Booking and dispatch', async () => {
    const db = database();
    const routes = routesFor('routes/bookings.js', db);
    let response = await request(routes['put /bookings/:id'], { trip_fee: 0, trans_fee: null });
    assert.equal(response.code, 200);
    assert.equal(db.state().bookings[0].trip_fee, 0);
    assert.equal(db.state().bookings[0].trans_fee, null);
    await request(routes['put /bookings/:id'], { job_name: 'Retained' });
    assert.equal(db.state().bookings[0].trip_fee, 0);
    response = await request(routes['post /shipments'], { data: [{ order_id: 'ORD-261031-001', trip_fee: 0, trans_fee: null }] });
    assert.equal(response.code, 200);
    assert.equal(db.state().financials[0].trip_fee, 0);
    assert.equal(db.state().financials[0].trans_fee, null);
});

function frontend(file, elements = {}) {
    const alerts = [];
    const context = {
        console: { error() {} }, URLSearchParams,
        window: { addEventListener() {}, location: { search: '' } },
        document: {
            getElementById: id => elements[id] || null,
            querySelectorAll: () => []
        },
        alert: message => alerts.push(message),
        localStorage: { getItem: () => null },
        fetch: async () => { throw new Error('Unmocked fetch'); }
    };
    Object.assign(context, context.window);
    context.window = context;
    vm.createContext(context);
    vm.runInContext(read(file), context, { filename: file });
    return { context, alerts, run: code => vm.runInContext(code, context) };
}

test('unbilled lookup uses selected Booking customer and preserves textual Order IDs', async () => {
    const elements = {
        'select-booking-no': { value: 'BK-B' },
        'modal-filter-booking': { value: '' }, 'modal-filter-date': { value: '' },
        'unbilled-modal': { classList: { remove() {}, add() {} } },
        'unbilled-tbody': { innerHTML: '' }
    };
    const page = frontend('public/js/modules/billing/detail.js', elements);
    page.run("allRawShipments = [{ booking_no: 'BK-A', customer_id: 1 }, { booking_no: 'BK-B', customer_id: 2 }]; filterUnbilledTable = () => {}; calculateDetailSummary = () => {};");
    let url;
    page.context.fetch = async value => {
        url = value;
        return { ok: true, json: async () => ({ success: true, data: [
            { order_id: 'ORD-NEW', customer_id: 2 }, { order_id: 'ORD-WRONG', customer_id: 1 }
        ] }) };
    };
    page.run('hotDetailInstance = { getSourceData: () => [], loadData: data => { window.loaded = data; } };');
    await page.context.window.openUnbilledModal();
    assert.match(url, /customer_id=2/);
    page.context.document.querySelectorAll = () => [{ value: 'ORD-NEW' }, { value: 'ORD-WRONG' }];
    page.context.window.closeUnbilledModal = () => {};
    page.context.window.appendSelectedUnbilled();
    assert.equal(page.context.window.loaded.length, 1);
    assert.equal(page.context.window.loaded[0].order_id, 'ORD-NEW');
});

test('IV save never reports success on HTTP error, application failure or partial save', async () => {
    for (const failure of ['http', 'application', 'partial', 'network']) {
        const elements = Object.fromEntries(['input-billing-status', 'input-billing-date', 'input-payment-date', 'input-receipt-no'].map(id => [id, { value: '' }]));
        const page = frontend('public/js/modules/billing/iv-detail.js', elements);
        page.run("hotIvDetailInstance = { getSourceData: () => [{order_id:'ORD-1'}] }; currentIvNo='IV-1';");
        let calls = 0;
        page.context.fetch = async () => {
            calls++;
            if (failure === 'network') throw new Error('Disconnected');
            return { ok: failure !== 'http', json: async () => ({ success: failure === 'http' || (failure === 'partial' && calls === 1), message: 'Failed' }) };
        };
        await page.context.window.saveAllIvDetails();
        assert.ok(!page.alerts.some(message => message.startsWith('✅')));
        assert.equal(calls, failure === 'partial' ? 2 : 1);
        if (failure === 'partial') assert.ok(page.alerts.some(message => message.includes('บันทึกรายการแล้ว')));
    }
});

test('container size route and SQL match mounted routes and supplied schema', () => {
    const sql = [];
    routesFor('routes/billing.js', { query: async query => { sql.push(query); return { rows: [] }; } });
    assert.ok(!read('routes/billing.js').includes('s.container_size'));
    for (const file of ['public/booking.html', 'public/booking-list.html', 'public/js/modules/booking/list.js', 'public/js/modules/booking/manage.js']) {
        assert.ok(!read(file).includes('/api/bookings/container-sizes'));
    }
    assert.match(read('server.js'), /app.use\('\/api', bookingRoutes\)/);
    assert.match(read('routes/bookings.js'), /router.get\('\/container-sizes'/);
});

test('missing DATABASE_URL fails before connecting and contains no credentials', () => {
    let connected = false;
    const context = {
        process: { env: {} }, module: { exports: {} },
        require: name => name === 'pg' ? { Pool: function() { connected = true; } } : { config() {} }
    };
    assert.throws(() => vm.runInNewContext(read('config/db.js'), context), /DATABASE_URL is required/);
    assert.equal(connected, false);
    assert.ok(!/postgres(?:ql)?:\/\//.test(read('config/db.js')));
});

test('Billing price bindings distinguish omitted, null and zero and INSERT has matching parameters', async () => {
    for (const input of [{}, { trip_fee: null }, { trip_fee: 0 }]) {
        const writes = [];
        const query = async (sql, values = []) => {
            if (/UPDATE financials|INSERT INTO financials/.test(sql)) {
                const highestParameter = Math.max(...Array.from(sql.matchAll(/\$(\d+)/g), match => Number(match[1])));
                assert.equal(highestParameter, values.length);
                writes.push({ sql, values });
            }
            return { rows: [], rowCount: 0 };
        };
        const pool = { connect: async () => ({ query, release() {} }) };
        const handler = routesFor('routes/billing.js', pool)['post /shipments'];
        const response = await request(handler, { data: [{ order_id: 'ORD-TEST', ...input }] });
        assert.equal(response.code, 200);
        assert.equal(writes.length, 2);
        assert.equal(writes[0].values[13], Object.hasOwn(input, 'trip_fee'));
        assert.equal(writes[0].values[6], input.trip_fee === 0 ? 0 : null);
        assert.ok(writes[0].values.slice(14).every(flag => flag === false));
        assert.match(writes[0].sql, /CASE WHEN \$14 THEN \$7 ELSE trip_fee END/);
    }
});

test('POST upsert preserves missing count and prices, and rejects invalid counts', async () => {
    const db = database();
    const handler = routesFor('routes/bookings.js', db)['post /bookings/header'];
    const response = await request(handler, { booking_no: 'BK-OLD', mode: 'EXPORT', run_date: '2026-10-31' });
    assert.equal(response.code, 200);
    assert.equal(db.state().bookings[0].container_count, 3);
    assert.equal(db.state().bookings[0].trip_fee, 100);
    for (const count of [null, '', 0, -1, 1.5, '2oops']) {
        const before = db.state();
        const rejected = await request(handler, { booking_no: 'BK-OLD', mode: 'EXPORT', run_date: '2026-10-31', container_count: count });
        assert.equal(rejected.code, 400);
        assert.deepEqual(db.state(), before);
    }
});

test('Booking form stops on master-rate save failure before saving Booking', async () => {
    const html = read('public/booking.html');
    const scripts = Array.from(html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g), match => match[1]);
    const values = {
        pMode: 'EXPORT', runDate: '2026-11-04', pCustomer: 'Customer', rowCount: '1',
        containerSize: '20', jobNameInput: 'New job', pJobType: 'CONTAINER', pPriceType: '6W',
        pTripFee: '100', pTransFee: '200', pOrigin: 'A', pDest: 'B'
    };
    const alerts = [];
    let calls = 0;
    const context = {
        window: { addEventListener() {} },
        document: { getElementById: id => ({ value: values[id] || '' }) },
        confirm: () => true, alert: message => alerts.push(message),
        fetch: async () => { calls++; return { ok: false, json: async () => ({ success: false }) }; },
        console: { error() {} }, URLSearchParams, tailwind: {}
    };
    vm.createContext(context);
    scripts.forEach(script => vm.runInContext(script, context));
    await context.submitBookingForm({});
    assert.equal(calls, 1);
    assert.ok(alerts.some(message => message.includes('ยังไม่ได้บันทึก Booking')));
    assert.ok(!alerts.some(message => message.startsWith('✅')));
});

test('changed JavaScript and HTML inline scripts parse without connecting to a database', () => {
    const files = ['server.js', 'config/db.js', 'routes/bookings.js', 'routes/billing.js',
        'public/js/modules/billing/detail.js', 'public/js/modules/billing/iv-detail.js', 'public/js/modules/billing/iv.js',
        'public/js/modules/booking/list.js', 'public/js/modules/booking/manage.js',
        'public/js/modules/booking/bulk.js', 'public/js/modules/booking/form.js', 'public/js/modules/booking/grid.js', 'public/js/password.js'];
    files.forEach(file => new vm.Script(read(file), { filename: file }));
    for (const file of ['public/booking.html', 'public/booking-list.html', 'public/admin.html', 'public/print-invoice.html']) {
        for (const script of read(file).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
            new vm.Script(script[1], { filename: file });
        }
    }
});

test('creating a Booking rolls back header and Orders when finance insertion fails', async () => {
    const db = database();
    const before = db.state();
    const originalQuery = db.query;
    db.connect = async () => ({ release() {}, query: async (sql, values) => {
        if (sql.includes('INSERT INTO financials')) throw new Error('Simulated finance write failure');
        return originalQuery(sql, values);
    } });
    const handler = routesFor('routes/bookings.js', db)['post /bookings/header'];
    const response = await request(handler, { booking_no: 'BK-FAIL', mode: 'EXPORT', run_date: '2026-11-04', container_count: 2 });
    assert.equal(response.code, 500);
    assert.equal(response.data.success, false);
    assert.deepEqual(db.state(), before);
});

test('unbilled lookup without a selected Booking does not use the first customer', async () => {
    const page = frontend('public/js/modules/billing/detail.js', { 'select-booking-no': { value: '' } });
    page.run("allRawShipments = [{booking_no:'BK-A', customer_id:1}];");
    let calls = 0;
    page.context.fetch = async () => { calls++; throw new Error('Should not fetch'); };
    await page.context.window.openUnbilledModal();
    assert.equal(calls, 0);
    assert.ok(page.alerts.some(message => message.includes('เลือก Booking')));
});

test('DEMURRAGE can be set, retained when omitted and cleared by PUT and POST', async () => {
    const db = database();
    const routes = routesFor('routes/bookings.js', db);
    const value = '2026-11-04 15:45';
    await request(routes['put /bookings/:id'], { demurrage: value });
    assert.equal(db.state().bookings[0].demurrage, value);
    await request(routes['put /bookings/:id'], { job_name: 'Keep time' });
    assert.equal(db.state().bookings[0].demurrage, value);
    await request(routes['put /bookings/:id'], { demurrage: null });
    assert.equal(db.state().bookings[0].demurrage, null);
    for (const time of [value, '']) {
        const response = await request(routes['post /bookings/header'], {
            booking_no: 'BK-OLD', mode: 'EXPORT', run_date: '2026-10-31', demurrage: time
        });
        assert.equal(response.code, 200);
        assert.equal(db.state().bookings[0].demurrage, time || null);
    }
});
