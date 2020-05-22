# CristinaDB

CristinaDB is a websocket-based database/service for quickly building prototypes, built on top of node-js and websocketd (http://websocketd.com/).

It's meant to be very easy to use and deploy. All we have to do is clone this repository, develop some additional services if needed, and then deploy it as-is in any server or container that runs node-js (**note**: the server/container must also ve a Linux amd64 box or you can replace the *websocketd* program with the corresponding architecture available here: http://websocketd.com/#download).

It has no dependencies, besides *websocketd*, so there's no need to `npm install` anything. But it does require a persistent file-system, so that kind of rules out Heroku dynos for the moment. I'll see if I can make the persistency customizable to some degree so that we can use other platforms, but I currently don't have the time.

## Docs - Draft:

### Introduction
CristinaDB is meant to be a generic backend, with built-in authentication/authorization. It allows users to create, delete and update Things. Things have a field called *data* that holds a base64 string of any size. A Thing can also have children Things, and the users can move a Thing from a parent Thing to another Thing.
So a Thing is like a file and directory at the same time. They have a path, just like directories and files. But the path name can't contain spaces because of technical reasons, and they can't contain forward slashes because they are the path separators. Any other character is fine for the names.

The authorization follows the same scheme, with each Thing having a owner user, and a owner group. There are read/write permission flags for the owner user and separate read/write flags for the owner group. A user can write to a Thing, for example, if he owns the Thing, in which case the owner user write flag needs to be true, or he is not the owner, but belongs to the same owner group, in which case the group write flag must be true.
Same thing for reading, except this time the system will try to recursively read all the children things as well but only those with the appropriate permissions.

The root user can create new users and groups, and change Thing permissions, but the regular user cannot. Even if he owns the Thing, that's because I couldn't think of a use case where a regular user would need to tinker with the ownership/permission of Things. It's not meant to be a true file-system, after all, but rather a technical metaphor for state that applies to a lot of applications.

### Usage

In a terminal:
```
$ node .
```

This will start the service, it will listen by TCP socket in the port given by the config's `tcpPort` property. And it will instruct `websocketd` to listen in the `websocketdPort` and also serve static files from the `./static` directory.

Every time a client connects via websocket, `websocketd` will spawn the `butler` script for that client. The butler's purpose is to target the converstation to that user specifically. The reason is that `cristinadb` requires an identifier to be pre-pended to every query and will also respond in the same manner. This way, the butler can use a random id to filter the responses relevant for that client only.

The websocket consumers don't need to worry about this at all. If they want a separate channel, just open a new websocket connection. But for the implementation of services it might be important to know it.

#### Services

The config has a property called `services`. It's empty by default. We can place executable files inside the `./services` directory and add them to the config like this:
```
...
services: [
    {
        name: 'my-service.js`,
        args: ['-d', '--file=something`, ...etc] // optional
    },
    {
        name: 'my-other-service.py`,
        args: []
    },
    ...
]
...
```

There is no restriction about what they can do, but my intent was that we could use services to read from the app state and respond with queries if needed.

For example, we could implement a registration script that polls the db every second or so, and reads the thing at the pathname `registration/requests`. For every valid registration request it would send the queries to create the corresponding users.

The way to connect to the database itself from within the services can be done either through websocket clients, or directly through a regular tcp socket connection to the port configured. If you connect with the tcp socket, however, you will interact with the raw messages. That means that you need to pre-pend an identifier to every query and filter the ones you're interested in. In my applications I'm using the service name as the identifier.

### Query Sintax

All parameters are required. Parameters in this documentation are indicated with  `(param)`, but you don't send the parentheses. Example, where it says `login (username) (password)` you would send `login my_username 1234`.

For every command, when an error occurs, the response will follow this format: `NOK (reason)`. If all went well it will return a simple `OK`, except in some cases where the return value is indicated in the documentation.

#### Super important notes
> Queries can be sent in a batch, separated by new-line characters (`\n`), or by the custom separator in the config. The difference is that by using the custom separator `cristinadb` will execute them *atomically*. That is, she will create a save-point for the state before executing the batch then try to execute it and, if an error happens, it will restore the state using that save-point.

By executing the custom-separator batches *atomically* we also mean that she will execute them in full, before moving on to any other query made by any other client. With line separators that is not guaranteed, because of potential race conditions.

Another important difference is that new-line-separated queries will get their responses individually. But the custom-separator batches will only get the final response, either an `OK` or a `NOK (reason)`.
So, there's no point in sending the `login` command in a custom-sep batch because you will need the token response to proceed. In that case, it's better to send `login` first, wait for the token response, and then use it to build the custom-sep queries.


#### List of Commands
- `login (username) (password)`
> Returns: `OK (token)`

> The default `root` user password is `root`.

- `changePassword (username) (password) (confirmPassword) (token)`

- `createUser (username) (password) (confirmPassword) (email) (token)`
> Only the root user can perform this.

- `createGroup (name) (token)`
> Only the root user can perform this.

- `addUserToGroup (username) (groupName) (token)`
> Only the root user can perform this.

- `removeUserFromGroup (username) (groupName) (token)`
> Only the root user can perform this.

- `createThing (pathName) (data) (token)`
> This will create a thing. The pathname follows this format `grandParentThing/parentThing/thing` all relative to the `mainThing` you will se in the JSON. There is no `/` thing, and neither `mainThing`. They will both return pathName errors.

> `data` Can be any string that doesn't contain spaces. It was meant to be a base64 string, though.

> By default the thing's owner will be the user that has an active session with the informed token. The owning group will be `null` by default.

- `readThing (pathName) (token)`
> Returns: `OK (JSON of the thing)`

> The JSON of the thing follows this format: `{ name: string, data: string, children: thing[] }`

> The `data` string is the raw data, if you encoded with base64 you'll need to decode it back.

> The `children` property contains all the thing's children to which the user who owns the session with the token has read access. The children's children are also included, and so on.

- `moveThing (originPathName) (destinationPathName) (token)`
> The `originPathName` must include the thing's name. But the `destinationPathName` must contain only the path of the destination thing. In other words it must be the path of the new parent, but **not** the path of the new parent + the thing.

> In order to move a thing, the user must have write access to both the current parent thing and the new parent thing. But not necessarily to the thing itself. The reasoning is that this command modifies both parents (specifically their `children` peroperty) but not the thing itself, which remains intact.

- `editThingData (pathName) (data) (token)`

- `deleteThing (pathName) (token)`
> If the user does not have write access to the thing, or to any of its descendants, the command will fail with Insufficient permissions.

- `changeOwner (pathName) (username) (token)`
> Only the root user can change the user who owns a thing.

- `changeGroup (pathName) (groupName) (token)`
> Only the root user can change the group who owns a thing.

- `changePermissions (pathName) (who) (permission) (token)`
> Only the root user can change permissions of things.

> `who` must be one of these: `owner`, `group`.

> The `permission` param must be *one* of these: `+read`, `-read`, `+write`, `-write`

- `enterMaintenance (token)`
> Only the root user can do this.

> When maintenance mode is active, all users other than root will get this response to any command except `login`: `NOK Maintenance`

- `exitMaintenance (token)`

- `log (token)`
> Only the root user can do this. It will resturn the entire state in JSON format.