'use strict';

const { spawn } = require('child_process');
const fs = require('fs');

const SYMBOL_MCMANAGER_BUFFER = Symbol();
const SYMBOL_MCMANAGER_MC = Symbol();
const SYMBOL_MCMANAGER_USERS = Symbol();
const SYMBOL_MCMAMAGER_AFK = Symbol();

const CONST_SERVER_THREAD = /^\[\d\d:\d\d:\d\d]\s\[Server thread\/\w+?]:\s+(.+)$/

const CONST_LOGGED_IN = /^([^\[]+)\[.+:\d+\] logged in with entity id/;
const CONST_LOGGED_OUT = /^(.+) left the game$/;
const CONST_USER_COMMENT = /^<([^\[]+)>\s(.+)$/;

const CONST_USER_ACTION = /^\!(.+?)\!\s(.+)$/;

function isCRLF(a) {
    return (a === 13 || a === 10);
}

class McManager {

    constructor(cmd, args, cwd) {
        const _this = this;

        const d = this._data = {}

        const mc = d[SYMBOL_MCMANAGER_MC] = spawn(cmd, args, {
            cwd: cwd
        });

        process.stdin.pipe(mc.stdin);
        mc.stdout.on('data', (data) => {
            _this._stdout(data);
        });

        d[SYMBOL_MCMANAGER_USERS] = new Set([]);
        d[SYMBOL_MCMAMAGER_AFK] = {};

        d[SYMBOL_MCMANAGER_BUFFER] = Buffer.alloc(0);

        mc.on('exit', (code) => {
            process.exit(code);
        });
    }

    close() {
        const d = this._data;
        
        const mc = d[SYMBOL_MCMANAGER_MC];

        mc.stdin.pause();
        
        mc.kill();
    }

    _stdout(data) {
        const d = this._data;

        const buffer = d[SYMBOL_MCMANAGER_BUFFER];

        d[SYMBOL_MCMANAGER_BUFFER] = Buffer.concat([buffer, data]);

        for (;;) {
            let beg = 0;
            for (;;) {
                if (beg >= d[SYMBOL_MCMANAGER_BUFFER].length) {
                    d[SYMBOL_MCMANAGER_BUFFER] = Buffer.alloc(0);
                    return;
                }
                if (isCRLF(d[SYMBOL_MCMANAGER_BUFFER][beg])) {
                    beg++;
                }
                break;
            }
            const new_b = Buffer.alloc(d[SYMBOL_MCMANAGER_BUFFER].length - beg);
                        
            d[SYMBOL_MCMANAGER_BUFFER].copy(new_b, 0, beg);
            d[SYMBOL_MCMANAGER_BUFFER] = new_b;
            let end = 0;
            for (;;) {
                if (end > d[SYMBOL_MCMANAGER_BUFFER].length) {
                    return;
                }
                if (!isCRLF(d[SYMBOL_MCMANAGER_BUFFER][end])) {
                    end++;
                    continue;
                }
                break;
            }
            if (end <= 0) {
                continue;
            }
            const result_b = Buffer.alloc(end);
            d[SYMBOL_MCMANAGER_BUFFER].copy(result_b, 0, 0);
            const new_b_1 = Buffer.alloc(d[SYMBOL_MCMANAGER_BUFFER].length - end);

            d[SYMBOL_MCMANAGER_BUFFER].copy(new_b_1, 0, end);
            d[SYMBOL_MCMANAGER_BUFFER] = new_b_1;

            this._processLine(result_b.toString());
        }
    }

    _processLine(line) {
        console.log(line);
        let result = null;

        // [Server thread/INFO]
        result = CONST_SERVER_THREAD.exec(line);
        if (null !== result) {
            const [, notice] = result;
            this._handleServerThread(notice);
            return;
        }
    }

    _getNotifications() {
        return new Promise(function(resolve, reject) {
            fs.readFile('broadcast.txt', (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(data.toString().split('\n'));
            });
        });
    }

    _handleServerThread(notice) {
        let result = null;

        const _this = this;
        const d = this._data;

        result = CONST_USER_COMMENT.exec(notice);
        if (null !== result) {
            const [, user, comment] = result;
            this._handleUserComment(user, comment);
            return;
        }

        const afk = d[SYMBOL_MCMAMAGER_AFK];

        // OpenCL[/10.2.0.1:58677] logged in with entity id ...
        result = CONST_LOGGED_IN.exec(notice);
        if (null !== result) {
            const [, user] = result;
            const users = d[SYMBOL_MCMANAGER_USERS];
            users.add(user.toLowerCase());
            d[SYMBOL_MCMAMAGER_AFK][user.toLowerCase()] = false;
            console.log(`User "${user}" joined.`);
            void async function() {
                try {
                    const notifications = await _this._getNotifications();
                    for (const notification of notifications) {
                        _this.msg(user, notification);
                    }
                } catch(e) {
                    console.error(e);
                }
                const afk_notify = [...users].filter(u => afk[u.toLowerCase()] === true);
                if (afk_notify.length > 0) {
                    afk_notify.length === 1
                        ? _this.msg(user, `The following user is currently AFK:`, 'dark_blue')
                        : _this.msg(user, `The following users are currently AFK:`, 'dark_blue');
                    for (const u of afk_notify) {
                        _this.msg(user, `    ◆ ${u}`, 'dark_blue');
                    }
                }
            }();
            // this.msg(user, 'Happy Chinese new year! 恭喜发财！ <(￣︶￣)↗[GO!]');
            // this.msg(user, 'Happy Birthday To Rachel! 不要怂就是干！ <(￣︶￣)↗[GO!]');
            return;
        }

        // OpenCL left the game
        result = CONST_LOGGED_OUT.exec(notice);
        if (null !== result) {
            const [, user] = result;
            const users = d[SYMBOL_MCMANAGER_USERS];
            users.delete(user.toLowerCase());
            console.log(`User "${user}" leaved.`);
            return;
        }
    }

    _handleUserComment(user, comment) {
        const result = CONST_USER_ACTION.exec(comment);

        if (result === null) {
            return;
        }

        const [, action, target] = result;

        switch (action) {
            case 'kick':
                this.kickUser(target, user);
                break;
            case 'afk':
                this.setAfk(user, target);
                break;
            default:
                console.log(`Action "${action}" not recognized.`);
        }
    }

    broadcast(message) {
        const d = this._data;
        const mc = d[SYMBOL_MCMANAGER_MC];
        mc.stdin.write(`/tellraw @a ["",${JSON.stringify({ "text": message, "color": 'green' })},{"text":" (If any command is abused, please report to OpenCL.)","color":"dark_red"}]\r\n`);
    }

    msg(user, message, color) {
        const d = this._data;
        const mc = d[SYMBOL_MCMANAGER_MC];
        mc.stdin.write(`/tellraw ${user} ["",${JSON.stringify({ "text": message, "color": color || 'yellow' })}]\r\n`);
    }

    kickUser(target, user) {
        user = user || 'WEB';

        const d = this._data;
        const users = d[SYMBOL_MCMANAGER_USERS];
        const mc = d[SYMBOL_MCMANAGER_MC];

        console.log(`Kicking "${target}" initiated by "${user}".`);

        console.log(users)

        if (target.toLowerCase() === user.toLowerCase()) {
            this.msg(user, `Why you want to kick yourself?`);
            return false;
        }

        if (!users.has(target.toLowerCase())) {
            this.msg(user, `The user does not seems to be online.`);
            return false;
        }

        console.log(`Broadcasting...`)

        this.broadcast(`Player "${user}" is kicking player "${target}" out of server. (╯°Д°)╯ ┻━┻`);

        setTimeout(() => {
            mc.stdin.write(`/kick ${target}\r\n`);
        }, 1500);

        return true;
    }

    setAfk(user, state) {
        const d = this._data;
        const s = state.toLowerCase();
        const afk = d[SYMBOL_MCMAMAGER_AFK];
        if (s === 'on') {
            afk[user.toLowerCase()] = true;
            this.broadcast(`Player "${user}" is settings himself/herself to AFK. (－_－) zzZ`);
        } else if (s === 'off') {
            afk[user.toLowerCase()] = false;
            this.broadcast(`Player "${user}" is settings himself/herself back to online. (。ﾟωﾟ) ﾊｯ!`);
        } else {
            this.msg(user, `Only "on" or "off" is allowed after afk directive.`);
        }
    }

    apiKickUser(target) {
        const d = this._data;
        const users = d[SYMBOL_MCMANAGER_USERS];
        if (!users.has(target.toLowerCase())) {
            return false;
        }
        if (d[SYMBOL_MCMAMAGER_AFK][target.toLowerCase()] !== true) {
            return false;
        }
        this.kickUser(target, null);
        return true;
    }

    apiGetUsers() {
        const d = this._data;
        const result = []
        for (const user of d[SYMBOL_MCMANAGER_USERS]) {
            result.push({
                id: user.toLowerCase(),
                afk: d[SYMBOL_MCMAMAGER_AFK][user.toLowerCase()] === true
            });
        }
        return result;
    }

}

module.exports = {
    McManager
}
