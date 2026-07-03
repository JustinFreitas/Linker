const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { LuaFactory } = require('wasmoon');

// Read source files
const managerLuaPath = path.join(__dirname, '../src/manager_linker.lua');
const managerLuaContent = fs.readFileSync(managerLuaPath, 'utf8');

const linkerXmlPath = path.join(__dirname, '../src/linker.xml');
const linkerXmlContent = fs.readFileSync(linkerXmlPath, 'utf8');

// Extract the inline script from linker.xml
const scriptRegex = /<button_text_content_center_top name="genLink">[\s\S]*?<script>([\s\S]*?)<\/script>/;
const inlineScriptMatch = linkerXmlContent.match(scriptRegex);
if (!inlineScriptMatch) {
    console.error('Failed to extract inline script from linker.xml');
    process.exit(1);
}
const inlineLuaContent = inlineScriptMatch[1];

async function createTestEngine() {
    const factory = new LuaFactory();
    const lua = await factory.createEngine();

    // Mock global Fantasy Grounds APIs
    const dbMock = {};
    const interfaceMock = {};
    const optionsManagerMock = {};
    const actorManagerMock = {};
    const combatManagerMock = {};
    const effectManagerMock = {};
    const userMock = {};
    const stringManagerMock = {};

    lua.global.set('DB', dbMock);
    lua.global.set('Interface', interfaceMock);
    lua.global.set('OptionsManager', optionsManagerMock);
    lua.global.set('ActorManager', actorManagerMock);
    lua.global.set('CombatManager', combatManagerMock);
    lua.global.set('EffectManager', effectManagerMock);
    lua.global.set('User', userMock);
    lua.global.set('StringManager', stringManagerMock);

    // Common dynamic mocks that will be customized per test
    lua.global.set('Session', {});
    lua.global.set('DesktopManager', {});
    lua.global.set('Comm', {});
    lua.global.set('window', {});

    return lua;
}

const tests = [];

function test(name, fn) {
    tests.push({ name, fn });
}

// ----------------------------------------------------
// Test Cases
// ----------------------------------------------------

test('manager_linker.lua: onTabletopInit registers sidebar tool button when user is host', async () => {
    const lua = await createTestEngine();

    // Setup host session and mock DesktopManager
    let registeredButton = null;
    let registerFlag = null;

    lua.global.set('Session', { IsHost: true });
    lua.global.set('DesktopManager', {
        registerSidebarToolButton: (tButton, flag) => {
            registeredButton = tButton;
            registerFlag = flag;
        }
    });

    // Run the Lua file
    await lua.doString(managerLuaContent);

    // Call onTabletopInit
    const onTabletopInit = lua.global.get('onTabletopInit');
    assert.ok(onTabletopInit, 'onTabletopInit function should be defined');
    onTabletopInit();

    // Assertions
    assert.ok(registeredButton, 'registerSidebarToolButton should have been called');
    assert.strictEqual(registeredButton.sIcon, 'linker_button');
    assert.strictEqual(registeredButton.tooltipres, 'linker_title_LabelCaption');
    assert.strictEqual(registeredButton.class, 'linker');
    assert.strictEqual(registerFlag, false);
});

test('manager_linker.lua: onTabletopInit does NOT register sidebar tool button when user is not host', async () => {
    const lua = await createTestEngine();

    // Setup client session and mock DesktopManager
    let registerCalled = false;

    lua.global.set('Session', { IsHost: false });
    lua.global.set('DesktopManager', {
        registerSidebarToolButton: () => {
            registerCalled = true;
        }
    });

    // Run the Lua file
    await lua.doString(managerLuaContent);

    // Call onTabletopInit
    const onTabletopInit = lua.global.get('onTabletopInit');
    onTabletopInit();

    // Assertions
    assert.strictEqual(registerCalled, false, 'registerSidebarToolButton should not be called for clients');
});

test('linker.xml (genLink button): onButtonPress builds and sends valid link structure', async () => {
    const lua = await createTestEngine();

    // Setup Comm and window mock
    let capturedMsg = null;
    lua.global.set('Comm', {
        addChatMessage: (msg) => {
            capturedMsg = msg;
        }
    });

    lua.global.set('window', {
        linkName: {
            getValue: () => 'Test Link Description'
        },
        linkURL: {
            getValue: () => 'https://fantasygrounds.com'
        }
    });

    // Run inline script
    await lua.doString(inlineLuaContent);

    // Call onButtonPress
    const onButtonPress = lua.global.get('onButtonPress');
    assert.ok(onButtonPress, 'onButtonPress function should be defined');
    onButtonPress();

    // Assertions
    assert.ok(capturedMsg, 'Comm.addChatMessage should be called');
    assert.strictEqual(capturedMsg.text, 'Test Link Description');
    assert.ok(Array.isArray(capturedMsg.shortcuts), 'shortcuts should be an array');
    assert.strictEqual(capturedMsg.shortcuts.length, 1);
    
    const shortcut = capturedMsg.shortcuts[0];
    assert.strictEqual(shortcut.description, 'Test Link Description');
    assert.strictEqual(shortcut.class, 'url');
    assert.strictEqual(shortcut.recordname, 'https://fantasygrounds.com');
});

test('linker.xml (genLink button): onButtonPress handles empty input values correctly', async () => {
    const lua = await createTestEngine();

    // Setup Comm and window mock with empty strings
    let capturedMsg = null;
    lua.global.set('Comm', {
        addChatMessage: (msg) => {
            capturedMsg = msg;
        }
    });

    lua.global.set('window', {
        linkName: {
            getValue: () => ''
        },
        linkURL: {
            getValue: () => ''
        }
    });

    // Run inline script
    await lua.doString(inlineLuaContent);

    // Call onButtonPress
    const onButtonPress = lua.global.get('onButtonPress');
    onButtonPress();

    // Assertions
    assert.ok(capturedMsg, 'Comm.addChatMessage should be called');
    assert.strictEqual(capturedMsg.text, '');
    assert.strictEqual(capturedMsg.shortcuts.length, 1);
    
    const shortcut = capturedMsg.shortcuts[0];
    assert.strictEqual(shortcut.description, '');
    assert.strictEqual(shortcut.class, 'url');
    assert.strictEqual(shortcut.recordname, '');
});

// ----------------------------------------------------
// Test Runner Execution
// ----------------------------------------------------

async function runAllTests() {
    let passed = 0;
    let failed = 0;

    console.log('Running Linker Unit Tests...\n');

    for (const t of tests) {
        console.log(`[ RUN ] ${t.name}`);
        try {
            await t.fn();
            console.log(`[ OK  ] ${t.name}\n`);
            passed++;
        } catch (err) {
            console.error(`[FAIL ] ${t.name}`);
            console.error(err);
            console.log();
            failed++;
        }
    }

    console.log('----------------------------------------------------');
    console.log(`Summary: ${passed} passed, ${failed} failed`);
    console.log('----------------------------------------------------');

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runAllTests().catch((err) => {
    console.error('Unhandled rejection during test execution:', err);
    process.exit(1);
});
