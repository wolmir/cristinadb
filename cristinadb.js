/**
 * Examples:
 * we nedd to have groups, and users.
 * The root user has a default password]
 * users can change their own password
 * but can't change the groups they belong to.
 * Onlt the root user can change the group members and create/delete groups
 * There are onbly two sets of permissions: the ones for the user who owns the file,
 * and the ones for the groups to which the owner belongs.
 * Should there be two records, one the file creator and one for the file owner?
 * Don't know yet.
 * for now we need he login and create user features.
 * Only the root user can create new users.
 * 
 * So, the commands we need to implement now are (Note: Everything is preceded with <sockId>):
 * - login root (password)
 * -- Returns OK (token) | NOK "Invalid username / password"
 * - logout (token)
 * -- Returns OK | NOK "No active session with this token"
 * - createUser (username) (password) (confirmPassword) (email) (token)
 * -- Returns OK | NOK "Username already in use" | NOK "Invalid username" | NOK "Invalid password" | NOK "Invalid email" | NOK "Email already in use"
 * -- NOK "Passwords don't match" | NOK "Invalid token" | NOK "Insufficient permissions"
 * - changePassword (username) (password) (confirmPassword) (token)
 * -- Returns OK | NOK "Username doesn't exist" | NOK "Invalid password" | NOK "Passwords don't match"
 * -- NOK "Invalid token" | NOK "Insufficient permissions"
 * - createGroup (name) (token)
 * -- Returns OK | NOK "Invalid name" | NOK "Name already in use" | NOK "Invalid token" | NOK "Insufficient permissions"
 * - addUserToGroup (username) (groupName) (token)
 * -- Returns OK | NOK "Invalid username" | NOK "Invalid group name" | NOK "Invalid token" | NOK "Insufficient permissions"
 * - removeUserFromGroup (username) (groupName) (token)
 * -- Returns OK | NOK "Invalid username" | NOK "Invalid group name" | NOK "Invalid token" | NOK "Insufficient permissions"
 * -- NOK "User not in group"
 * - deleteGroup (groupName) (token)
 * -- Returns OK | NOK "Invalid group" | NOK "Invalid token" | NOK "Insufficient permissions"
 * - deleteUser (username) (token)
 * -- Returns OK | NOK "Invalid user" | NOK "Invalid token" | NOK "Insufficient permissions"
 * - createThing (pathName) (data) (token)
 * -- Returns OK | NOK "Invalid path name" | NOK "Invalid token" | NOK "Insufficient permissions"
 * - readThing (pathName) (token)
 * -- Returns OK "{ data: (data), children: [...(chidren read results)] }" | NOK "Invalid path name" | NOK "Invalid token" | NOK "Insufficient permissions"
 * - editThingData (pathName) (data)
 * -- Returns OK | NOK "Invalid path name" | NOK "Invalid token" | NOK "Insufficient permissions"
 * - moveChild [(pathName) | (index)] (newPathName) (token)
 * -- Returns OK | NOK "Invalid child" | NOK "Invalid path name" | NOK "Invalid token" | NOK "Insufficient permissions"
 * - changeOwnerUser (pathName) (username) (token)
 * -- Returns OK | NOK "Invalid path name" | NOK "Invalid user" | NOK "Invalid token" | NOK "Insufficient permissions"
 * - changeOwnerGroup (pathName) (groupName) (token)
 * -- Returns OK | NOK "Invalid path name" | NOK "Invalid group" | NOK "Invalid token" | NOK "Insufficient permissions"
 * - changePermissions (pathName) (permissions) (token)
 * -- Returns OK | NOK "Invalid path name" | NOK "Invalid permission" | NOK "Invalid token" | NOK "Insufficient permissions"
 * - deleteThing (pathName) (token)
 * -- Returns OK | NOK "Invalid token" | NOK "Insufficient permissions"
 * - anything else
 * -- Returns NOK "Invalid command"
 */

const crypto = require('crypto');
const fs = require('fs');

const config = require('./config');

function hash(value) {
    const h = crypto.createHash('sha256');
    h.update(value);
    return h.digest('base64');
}

function main() {
    process.stdin.setEncoding('utf8');

    let state = {
        mode: 'active',
        users: [
            {
                username: 'root',
                password: hash('root')
            }
        ],
        groups: [],
        sessions: [],
        mainThing: {
            name: 'mainThing',
            children: [],
            data: null,
            owner: 'root',
            group: null,
            permissions: {
                owner: { read: true, write: true },
                group: { read: false, write: false }
            }
        }
    };

    try {
        state = JSON.parse(fs.readFileSync('./db.json', 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') {
            if (config.buildQuery) {
                state = processCmds(state, cmds).newState;
            }

            fs.writeFileSync('./db.json', JSON.stringify(state), 'utf8');
        } else {
            throw error;
        }
    }

    process.stdin.on('data', (txt) => {
        let [sockId, ...rest] = txt.trim().split(' ');

        try {
            let cmds = parseCmds(rest.join(' '));

            let { newState, response } = processCmds(state, cmds);

            state = newState;

            console.log(`${sockId} OK ${response}`);
        } catch (err) {
            if (err === 'Reset') {
                try {
                    state = JSON.parse(fs.readFileSync('./db.json', 'utf8'));
                } catch (error) {
                    if (error.code === 'ENOENT') {
                        fs.writeFileSync('./db.json', JSON.stringify(state), 'utf8');
                    } else {
                        throw error;
                    }
                }
            } else {
                console.log(`${sockId} NOK ${err}`);
            }
        }

        fs.writeFileSync('./db.json', JSON.stringify(state), 'utf8');
    })
}

function processCmds(state, cmds) {
    let newState = JSON.parse(JSON.stringify(state));
    let response = null;

    cmds.forEach((cmd) => {
        let result = processCmd(newState, cmd);

        newState = result.newState;
        response = result.response;
    });

    return { newState, response };
}

function processCmd(state, cmd) {
    try {
        processLogin(state, cmd);

        if (state.mode === 'maintenance') {
            try {
                validateTokenForRoot(state, cmd.token);
            } catch (error) {
                throw 'Maintenance';
            }
        }

        processCreateUser(state, cmd);
        processCreateGroup(state, cmd);
        processAddUserToGroup(state, cmd);
        processRemoveUserFromGroup(state, cmd);
        processCreateThing(state, cmd);
        processReadThing(state, cmd);
        processEditThingData(state, cmd);
        processMoveChild(state, cmd);
        processChangeOwner(state, cmd);
        processChangeGroup(state, cmd);
        processChangePermissions(state, cmd);
        processDeleteThing(state, cmd);
        processEnterMaintenance(state, cmd);
        processExitMaintenance(state, cmd);
        processLog(state, cmd);
        processChangePassword(state, cmd);
    } catch (result) {
        if (result.newState) {
            return result;
        }

        throw result;
    }

    throw `Command not implemented (${cmd.type})`;
}

function validateTokenForRoot(state, token) {
    let session = state.sessions.find(s => s.token === token);

    if (!session) {
        throw 'Invalid token';
    }

    if (!(session.user.username === 'root')) {
        throw 'Insufficient permissions';
    }
}

function processCreateGroup(state, { type, name, token }) {
    if (type === 'createGroup') {
        validateTokenForRoot(state, token);

        state.groups.forEach(g => {
            if (g.name === name) {
                throw 'Group name already in use';
            }
        })

        let newState = {
            ...state,
            groups: [
                ...state.groups,
                {
                    name,
                    members: []
                }
            ]
        };

        let response = '';

        throw {
            newState,
            response
        };
    }
}

function processCreateUser(state, { type, username, password, confirmPassword, email, token }) {
    if (type === 'createUser') {
        validateTokenForRoot(state, token);

        state.users.forEach(u => {
            if (u.username === 'username') {
                throw 'Username already in use';
            }

            if (u.email === email) {
                throw 'Email already in use';
            }
        });

        if (password !== confirmPassword) {
            throw `Passwords don't match`;
        }

        let newState = {
            ...state,
            users: [...state.users, {
                username,
                email,
                password: hash(password)
            }]
        };

        let response = '';

        throw {
            newState,
            response
        };
    }
}

function processLogin(state, { type, username, password }) {
    if (type === 'login') {
        let user = state.users.find(u => (u.username === username) && (u.password === hash(password)));

        if (!user) {
            throw 'Invalid username/password';
        }

        let token = hash(password + Math.random());

        let newState = {
            ...state,
            sessions: [...state.sessions, { user, token }]
        };

        throw {
            newState,
            response: token
        };
    }
}

function validateGroup(state, groupName) {
    let group = state.groups.find(g => g.name === groupName);

    if (!group) {
        throw 'Invalid group';
    }
}

function validateUser(state, username) {
    let user = state.users.find(g => g.username === username);

    if (!user) {
        throw 'Invalid user';
    }
}

function processAddUserToGroup(state, { type, username, groupName, token }) {
    if (type === 'addUserToGroup') {
        validateTokenForRoot(state, token);
        validateGroup(state, groupName);
        validateUser(state, username);

        let group = state.groups.find(g => g.name === groupName);

        group.members.forEach(un => {
            if (un === username) {
                throw `User ${username} is already a member of group ${groupName}`;
            }
        });

        let newState = {
            ...state,
            groups: state.groups.map(g => {
                if (g.name === groupName) {
                    return {
                        ...g,
                        members: [...g.members, username]
                    };
                }

                return g;
            })
        };

        let response = '';

        throw {
            newState, response
        };
    }
}

function processRemoveUserFromGroup(state, { type, username, groupName, token }) {
    if (type === 'removeUserFromGroup') {
        validateTokenForRoot(state, token);
        validateGroup(state, groupName);
        validateUser(state, username);

        let group = state.groups.find(g => g.name === groupName);

        let user = group.members.find(un => un === username);

        if (!user) {
            throw `User ${username} is not a member of group ${groupName}`;
        }

        let newState = {
            ...state,
            groups: state.groups.map(g => {
                if (g.name === groupName) {
                    return {
                        ...g,
                        members: g.members.filter(un => un !== username)
                    };
                }

                return g;
            })
        };

        let response = '';

        throw {
            newState, response
        };
    }
}

function validateToken(state, token) {
    let session = state.sessions.find(s => s.token === token);

    if (!session) {
        throw 'Invalid token';
    }

    return session.user;
}

function createThing(state, parentThing, user, pathName, data) {
    let [name, ...rest] = pathName;

    let otherThing = parentThing.children.find(t => t.name === name);

    if (pathName.length === 1) {
        if (otherThing) {
            throw 'Invalid path name';
        }

        let owner = parentThing.owner;

        if (user.username === owner) {
            if (!parentThing.permissions.owner.write) {
                throw 'Insufficient permissions';
            }
        } else {
            let groupName = parentThing.group;

            if (!groupName) {
                throw 'Insufficient permissions';
            }

            let group = state.groups.find(g => g.name === groupName);

            if (!group) {
                throw 'Insufficient permissions';
            }

            if (!group.members.includes(user.username)) {
                throw 'Insufficient permissions';
            }

            if (!parentThing.permissions.group.write) {
                throw 'Insufficient permissions';
            }
        }


        return {
            ...parentThing,
            children: [
                ...parentThing.children,
                {
                    name: pathName[0],
                    owner: user.username,
                    group: null,
                    data,
                    children: [],
                    permissions: {
                        owner: { read: true, write: true },
                        group: { read: false, write: false }
                    }
                }
            ]
        }
    }

    if (!otherThing) {
        throw 'Invalid path name';
    }

    return {
        ...parentThing,
        children: parentThing.children
            .filter(c => c.name !== otherThing.name)
            .concat([createThing(state, otherThing, user, rest, data)])
    };
}

function processCreateThing(state, { type, pathName, data, token }) {
    if (type === 'createThing') {
        let user = validateToken(state, token);

        let newState = {
            ...state,
            mainThing: createThing(state, state.mainThing, user, pathName.split('/'), data)
        };

        let response = '';

        throw {
            newState, response
        };
    }
}

function validateUserThingReadPermissions(state, thing, user) {
    validateUserThingPermisions(state, user, thing, 'read');
}

function readThing(state, thing, user, pathName) {
    validateUserThingReadPermissions(state, thing, user);

    if (pathName.length === 0) {
        return {
            data: thing.data,
            name: thing.name,
            children: thing.children
                .map(child => {
                    try {
                        return readThing(state, child, user, pathName);
                    } catch (error) {
                        return null;
                    }
                })
                .filter(c => c !== null)
        };
    }

    let [name, ...rest] = pathName;

    let otherThing = thing.children.find(t => t.name === name);

    if (!otherThing) {
        throw 'Invalid path name';
    }

    return readThing(state, otherThing, user, rest);
}

function processReadThing(state, { type, pathName, token }) {
    if (type === 'readThing') {
        let user = validateToken(state, token);

        let response = JSON.stringify(readThing(state, state.mainThing, user, pathName.split('/')));

        throw {
            newState: { ...state },
            response
        };
    }
}

function validateUserThingPermisions(state, user, thing, operation) {
    if (user.username === thing.owner) {
        if (!thing.permissions.owner[operation]) {
            throw 'Insufficient permissions';
        }
    } else {
        if (!thing.group) {
            throw 'Insufficient permissions';
        }

        let group = state.groups.find(g => g.name === thing.group);

        if (!group) {
            throw 'Insufficient permissions';
        }

        if (group.members.includes(user.username)) {
            if (!thing.permissions.group[operation]) {
                throw 'Insufficient permissions';
            }
        } else {
            throw 'Insufficient permissions';
        }
    }
}

function validateUserThingPermisionsDeep(state, user, thing, operation) {
    validateUserThingPermisions(state, user, thing, operation);

    thing.children.forEach(child => validateUserThingPermisionsDeep(state, user, child, operation));
}

function findThing(state, thing, user, pathName) {
    if (pathName.length === 0) {
        return thing;
    }

    if (user) {
        validateUserThingPermisions(state, user, thing, 'read');
    } // Otherwise, it's root

    let [name, ...rest] = pathName;

    let otherThing = thing.children.find(t => t.name === name);

    if (!otherThing) {
        throw 'Invalid path name';
    }

    return findThing(state, otherThing, user, rest);
}

function processEditThingData(state, { type, pathName, data, token }) {
    if (type === 'editThingData') {
        let user = validateToken(state, token);

        let thing = findThing(state, state.mainThing, user, pathName.split('/'));

        validateUserThingPermisions(state, user, thing, 'write');

        thing.data = data;

        throw {
            newState: state,
            response: ''
        };
    }
}

function processMoveChild(state, { type, pathName, newPathName, token }) {
    if (type === 'moveChild') {
        let user = validateToken(state, token);

        let splitPath = pathName.split('/');
        let parentPath = splitPath.slice(0, splitPath.length - 1);
        let destinationPath = newPathName.split('/');

        let origin = findThing(state, state.mainThing, user, parentPath);
        let thing = findThing(state, state.mainThing, user, splitPath);
        let destination = findThing(state, state.mainThing, user, destinationPath);

        validateUserThingPermisions(state, user, origin, 'write');
        validateUserThingPermisions(state, user, destination, 'write');

        origin.children = origin.children.filter(t => t.name !== thing.name);
        destination.children = destination.children.concat([thing]);

        throw {
            newState: state,
            response: ''
        };
    }
}

function processChangeOwner(state, { type, pathName, username, token }) {
    if (type === 'changeOwner') {
        validateTokenForRoot(state, token);

        let user = state.users.find(u => u.username === username);

        if (!user) {
            throw 'User not found';
        }

        let thing = findThing(state, state.mainThing, null, pathName.split('/'));

        thing.owner = username;

        throw {
            newState: state,
            response: ''
        };
    }
}

function processChangeGroup(state, { type, pathName, groupName, token }) {
    if (type === 'changeGroup') {
        validateTokenForRoot(state, token);

        let group = state.groups.find(u => u.name === groupName);

        if (!group) {
            throw 'Group not found';
        }

        let thing = findThing(state, state.mainThing, null, pathName.split('/'));

        thing.group = groupName;

        throw {
            newState: state,
            response: ''
        };
    }
}

function processChangePermissions(state, { type, pathName, who, permission, token }) {
    if (type === 'changePermissions') {
        validateTokenForRoot(state, token);

        let thing = findThing(state, state.mainThing, null, pathName.split('/'));

        switch (permission) {
            case '+r':
                thing.permissions[who].read = true;
                break;

            case '-r':
                thing.permissions[who].read = false;
                break;

            case '+w':
                thing.permissions[who].write = true;
                break;

            case '-w':
                thing.permissions[who].write = false;
                break;

            default:
                throw 'Invalid permission flag'
        }

        throw {
            newState: state,
            response: ''
        };
    }
}

function processDeleteThing(state, { type, pathName, token }) {
    if (type === 'deleteThing') {
        let user = validateToken(state, token);

        let splitPath = pathName.split('/');
        let thing = findThing(state, state.mainThing, user, splitPath);
        let parentThing = findThing(state, state.mainThing, user, splitPath.slice(0, splitPath.length - 1));

        validateUserThingPermisions(state, user, thing, 'write');
        validateUserThingPermisions(state, user, parentThing, 'write');

        validateUserThingPermisionsDeep(state, user, thing, 'write');

        parentThing.children = parentThing.children.filter(c => c.name !== thing.name);

        return {
            newState: state,
            response: ''
        };
    }
}

function processEnterMaintenance(state, { type, token }) {
    if (type === 'enterMaintenance') {
        validateTokenForRoot(token);

        throw {
            newState: {
                ...state,
                mode: 'maintenance'
            },
            response: ''
        };
    }
}

function processExitMaintenance(state, { type, token }) {
    if (type === 'exitMaintenance') {
        validateTokenForRoot(token);

        throw 'Reset';
    }
}

function processLog(state, { type, token }) {
    if (type === 'log') {
        validateTokenForRoot(token);

        throw {
            newState: state,
            response: JSON.stringify(state)
        };
    }
}

function processChangePassword(state, { type, username, password, confirmPassword, token }) {
    if (type === 'changePassword') {
        let user = validateToken(state, token);

        if ((user.username !== 'root') && (user.username !== username)) {
            throw 'Insufficient permissions';
        }

        if (password !== confirmPassword) {
            throw 'Passwords don\'t match';
        }

        let hashed = hash(password);

        let newState = {
            ...state,
            users: state.users
                .map(u => {
                    if (u.username === username) {
                        return {
                            ...u,
                            password: hashed
                        };
                    }

                    return u;
                })
        };

        throw {
            newState,
            response: ''
        };
    }
}

function parseCmds(txt) {
    return txt.split(config.customSeparator).map((piece) => parseCmd(piece));
}

function parseCmd(txt) {
    try {
        parseLogin(txt);
        parseCreateUser(txt);
        parseCreateGroup(txt);
        parseAddUserToGroup(txt);
        parseRemoveUserFromGroup(txt);
        parseCreateThing(txt);
        parseReadThing(txt);
        parseEditThingData(txt);
        parseMoveChild(txt);
        parseChangeOwner(txt);
        parseChangeGroup(txt);
        parseChangePermissions(txt);
        parseDeleteThing(txt);
        parseEnterMaintenance(txt);
        parseExitMaintenance(txt);
        parseLog(txt);
        parseChangePassword(txt);
    } catch (result) {
        if (result.cmd) {
            return result.cmd;
        }

        throw result;
    }

    throw `Invalid command ${txt}`;
}

function parseLogin(txt) {
    if (txt.startsWith('login')) {
        let [_, username, password] = txt.split(' ');

        if (!username || !username.length) {
            throw 'Invalid username'
        }

        if (!password || !password.length) {
            throw 'Invalid password'
        }

        throw {
            cmd: { type: 'login', username, password }
        };
    }
}

// * - createUser (username) (password) (confirmPassword) (email) (token)
// * -- Returns OK | NOK "Username already in use" | NOK "Invalid username" | NOK "Invalid password" | NOK "Invalid email" | NOK "Email already in use"
function parseCreateUser(txt) {
    if (txt.startsWith('createUser')) {
        let [_, username, password, confirmPassword, email, token] = txt.split(' ');

        if (!username || !username.length) {
            throw 'Invalid username'
        }

        if (!password || !password.length) {
            throw 'Invalid password'
        }

        if (!confirmPassword || !confirmPassword.length) {
            throw 'Invalid password confirmation'
        }

        if (!email || !email.length) {
            throw 'Invalid email'
        }

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        throw {
            cmd: { type: 'createUser', username, password, confirmPassword, email, token }
        };
    }
}

// * - createGroup (name) (token)
// * -- Returns OK | NOK "Invalid name" | NOK "Name already in use" | NOK "Invalid token" | NOK "Insufficient permissions"
function parseCreateGroup(txt) {
    if (txt.startsWith('createGroup')) {
        let [_, name, token] = txt.split(' ');

        if (!name || !name.length) {
            throw 'Invalid group name';
        }

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        throw {
            cmd: { type: 'createGroup', name, token }
        };
    }
}

//* - addUserToGroup (username) (groupName) (token)
//* -- Returns OK | NOK "Invalid username" | NOK "Invalid group name" | NOK "Invalid token" | NOK "Insufficient permissions"
function parseAddUserToGroup(txt) {
    if (txt.startsWith('addUserToGroup')) {
        let [_, username, groupName, token] = txt.split(' ');

        if (!username || !username.length) {
            throw 'Invalid username';
        }

        if (!groupName || !groupName.length) {
            throw 'Invalid group name';
        }

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        throw {
            cmd: { type: 'addUserToGroup', username, groupName, token }
        };
    }
}

//* - removeUserFromGroup (username) (groupName) (token)
//* -- Returns OK | NOK "Invalid username" | NOK "Invalid group name" | NOK "Invalid token" | NOK "Insufficient permissions"
function parseRemoveUserFromGroup(txt) {
    if (txt.startsWith('removeUserFromGroup')) {
        let [_, username, groupName, token] = txt.split(' ');

        if (!username || !username.length) {
            throw 'Invalid username';
        }

        if (!groupName || !groupName.length) {
            throw 'Invalid group name';
        }

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        throw {
            cmd: { type: 'removeUserFromGroup', username, groupName, token }
        };
    }
}

// * - createThing (pathName) (data) (token)
// * -- Returns OK | NOK "Invalid path name" | NOK "Invalid token" | NOK "Insufficient permissions"
function parseCreateThing(txt) {
    if (txt.startsWith('createThing')) {
        let [_, pathName, data, token] = txt.split(' ');

        if (!pathName || !pathName.length) {
            throw 'Invalid path name';
        }

        if (!data || !data.length) {
            throw 'Invalid data';
        }

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        throw {
            cmd: { type: 'createThing', pathName, data, token }
        };
    }
}

//* - readThing (pathName) (token)
//* -- Returns OK "{ data: (data), children: [...(chidren read results)] }" | NOK "Invalid path name" | NOK "Invalid token" | NOK "Insufficient permissions"
function parseReadThing(txt) {
    if (txt.startsWith('readThing')) {
        let [_, pathName, token] = txt.split(' ');

        if (!pathName || !pathName.length) {
            throw 'Invalid path name';
        }

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        throw {
            cmd: { type: 'readThing', pathName, token }
        };
    }
}

function parseEditThingData(txt) {
    if (txt.startsWith('editThingData')) {
        let [_, pathName, data, token] = txt.split(' ');

        if (!pathName || !pathName.length) {
            throw 'Invalid path name';
        }

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        if (!data || !data.length) {
            throw 'Invalid data'
        }

        throw {
            cmd: { type: 'editThingData', pathName, data, token }
        };
    }
}

//* - changeOwnerUser (pathName) (username) (token)
//* -- Returns OK | NOK "Invalid path name" | NOK "Invalid user" | NOK "Invalid token" | NOK "Insufficient permissions"
function parseChangeOwner(txt) {
    if (txt.startsWith('changeOwner')) {
        let [_, pathName, username, token] = txt.split(' ');

        if (!pathName || !pathName.length) {
            throw 'Invalid path name';
        }

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        if (!username || !username.length) {
            throw 'Invalid username'
        }

        throw {
            cmd: { type: 'changeOwner', pathName, username, token }
        };
    }
}

function parseChangeGroup(txt) {
    if (txt.startsWith('changeGroup')) {
        let [_, pathName, groupName, token] = txt.split(' ');

        if (!pathName || !pathName.length) {
            throw 'Invalid path name';
        }

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        if (!groupName || !groupName.length) {
            throw 'Invalid group name'
        }

        throw {
            cmd: { type: 'changeGroup', pathName, groupName, token }
        };
    }
}

//* - moveChild [(pathName) | (index)] (newPathName) (token)
//* -- Returns OK | NOK "Invalid child" | NOK "Invalid path name" | NOK "Invalid token" | NOK "Insufficient permissions"
function parseMoveChild(txt) {
    if (txt.startsWith('moveChild')) {
        let [_, pathName, newPathName, token] = txt.split(' ');

        if (!pathName || !pathName.length) {
            throw 'Invalid path name';
        }

        if (!newPathName || !newPathName.length) {
            throw 'Invalid destination name'
        }

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        throw {
            cmd: { type: 'moveChild', pathName, newPathName, token }
        };
    }
}

function parseChangePermissions(txt) {
    if (txt.startsWith('changePermissions')) {
        let [_, pathName, who, permission, token] = txt.split(' ');

        if (!pathName || !pathName.length) {
            throw 'Invalid path name';
        }

        if (!who || !who.length || !(['group', 'owner'].includes(who))) {
            throw 'Invalid subject'
        }

        if (!permission || !permission.length || !(['+r', '-r', '+w', '-w'].includes(permission))) {
            throw 'Invalid permission'
        }

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        throw {
            cmd: { type: 'changePermissions', pathName, who, permission, token }
        };
    }
}

function parseDeleteThing(txt) {
    if (txt.startsWith('deleteThing')) {
        let [_, pathName, token] = txt.split(' ');

        if (!pathName || !pathName.length) {
            throw 'Invalid path name';
        }

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        throw {
            cmd: { type: 'deleteThing', pathName, token }
        };
    }
}

function parseEnterMaintenance(txt) {
    if (txt.startsWith('enterMaintenance')) {
        let [_, token] = txt.split(' ');

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        throw {
            cmd: { type: 'enterMaintenance', token }
        };
    }
}

function parseExitMaintenance(txt) {
    if (txt.startsWith('exitMaintenance')) {
        let [_, token] = txt.split(' ');

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        throw {
            cmd: { type: 'exitMaintenance', token }
        };
    }
}

function parseLog(txt) {
    if (txt.startsWith('log')) {
        let [_, token] = txt.split(' ');

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        throw {
            cmd: { type: 'log', token }
        };
    }
}

//* - changePassword (username) (password) (confirmPassword) (token)
//* -- Returns OK | NOK "Username doesn't exist" | NOK "Invalid password" | NOK "Passwords don't match"
//* -- NOK "Invalid token" | NOK "Insufficient permissions"
function parseChangePassword (txt) {
    if (txt.startsWith('changePassword')) {
        let [_, username, password, confirmPassword, token] = txt.split(' ');

        if (!username || !username.length) {
            throw 'Invalid username'
        }

        if (!password || !password.length) {
            throw 'Invalid password'
        }

        if (!confirmPassword || !confirmPassword.length) {
            throw 'Invalid password confirmation'
        }

        if (!token || !token.length) {
            throw 'Invalid token'
        }

        throw {
            cmd: { type: 'changePassword', username, password, confirmPassword, token }
        };
    }
}


main()