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
                password: hash('root')
            }
        ],
        groups: [],
        sessions: []
    };

    process.stdin.on('data', (txt) => {
        let [sockId, ...rest] = txt.trim().split(' ');

        if (sockId === 'log') {
            console.log();
            console.log(JSON.stringify(state, null, 4));
            console.log();
        } else {
            try {
                let cmds = parseCmds(rest.join(' '));
                let { newState, response } = processCmds(state, cmds);
                state = newState;

                console.log(`${sockId} OK ${response}`);
            } catch (err) {
                console.log(`${sockId} NOK ${err}`);
            }
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

function processCmd(state, cmd) {
    try {
        processLogin(state, cmd);
        processCreateUser(state, cmd);
        processCreateGroup(state, cmd);
        processAddUserToGroup(state, cmd);
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

function processCreateGroup (state, { type, name, token }) {
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

function validateGroup (state, groupName) {
    let group = state.groups.find(g => g.name === groupName);

    if (!group) {
        throw 'Invalid group';
    }
}

function validateUser (state, username) {
    let user = state.users.find(g => g.username === username);

    if (!user) {
        throw 'Invalid user';
    }
}

function processAddUserToGroup (state, { type, username, groupName, token }) {
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
                        members: [ ...g.members, username ]
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

function parseCmds(txt) {
    return txt.split('::||::').map((piece) => parseCmd(piece));
}

function parseCmd(txt) {
    try {
        parseLogin(txt);
        parseCreateUser(txt);
        parseCreateGroup(txt);
        parseAddUserToGroup(txt);
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
function parseCreateGroup (txt) {
    if (txt.startsWith('createGroup')) {
        let [ _, name, token ] = txt.split(' ');

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
function parseAddUserToGroup (txt) {
    if (txt.startsWith('addUserToGroup')) {
        let [ _, username, groupName, token ] = txt.split(' ');

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

main()