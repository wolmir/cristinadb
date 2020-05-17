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

function hash(value) {
    const h = crypto.createHash('sha256');
    h.update(value);
    return h.digest('base64');
}

function main() {
    process.stdin.setEncoding('utf8');

    let state = {
        users: [
            {
                username: 'root',
                password: 'root'
            }
        ],
        sessions: []
    };

    process.stdin.on('data', (txt) => {
        try {
            let [ sockId, ...rest] = txt.trim().split(' ');

            let cmds = parseCmds(rest.join(' '));
            let { newState, response } = processCmds(state, cmds);
            state = newState;

            console.log(`${sockId} OK ${response}`);
        } catch (err) {
            console.log(`${sockId} NOK ${err}`);
        }
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

function processCmd (state, cmd) {
    try {
        processLogin(state, cmd);
    } catch (result) {
        if (result.newState) {
            return result;
        }

        throw result;
    }

    throw 'Command not implemented';
}

function processLogin (state, { username, password }) {
    let user = state.users.find(u => (u.username === username) && (u.password === password));

    if (!user) {
        throw 'Invalid username/password';
    }

    let token = hash(password + Math.random());

    let newState = {
        ...state,
        sessions: [ ...state.sessions, { user, token } ]
    };

    throw {
        newState,
        response: token
    };
}

function parseCmds (txt) {
    return txt.split('::||::').map((piece) => parseCmd(piece));
}

function parseCmd (txt) {
    try {
        parseLogin(txt);
    } catch (result) {
        if (result.cmd) {
            return result.cmd;
        }

        throw result;
    }

    throw `Invalid command ${txt}`;
}

function parseLogin (txt) {
    if (txt.startsWith('login')) {
        let [ _, username, password ] = txt.split(' ');

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

main()