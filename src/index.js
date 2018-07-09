'use strict';

const http = require('http');
const { McManager } = require('./McManager');
const mongoose = require('mongoose');

const { Schema } = mongoose;

if (process.argv.length < 3) {
    throw new Error(`Argument too few.`);
}

const [, , java, ...args] = process.argv;

console.log(java, args);

const Map = mongoose.model('Map', new Schema({ 
    chunk_x: Number,
    chunk_z: Number,
    last_update: { type: Date, default: Date.now },
    data: String
}));

mongoose.connect('mongodb://127.0.0.1/minecraft');

const mc_manager = new McManager(java, args);

process.on('SIGTERM', function () {
    // NOOP
    mc_manager.close();
    setTimeout(() => {
        process.exit(0);
    }, 3000);
});

const express = require('express')
const app = express()

app.get('/users', (req, res) => {
    res.json(mc_manager.apiGetUsers());
});

app.get('/user/:id/kick', (req, res) => {
    const id = req.params.id;

    if (!mc_manager.apiKickUser(id, null)) {
        res.json({
            error_code: 0,
            result_code: -1
        });
        return;
    }

    res.json({
        error_code: 0,
        result_code: 0
    });
});

app.get('/map/chunk/:x/:z', async (req, res) => {
    try {
        if (!/^\-?\d{1,8}$/.test(req.params.x)) {
            throw new Error(`Invalid parameter x.`);
        }
        if (!/^\-?\d{1,8}$/.test(req.params.z)) {
            throw new Error(`Invalid parameter z.`);
        }
        const x = parseInt(req.params.x, 10);
        const z = parseInt(req.params.z, 10);
        const chunk = await Map.findOne({
            chunk_x: x,
            chunk_z: z
        });
        if (!chunk) {
            res.json({
                error_code: 0,
                result_code: 0,
                data: {
                    available: false
                }
            });
            return;
        };
        res.json({
            error_code: 0,
            result_code: 0,
            data: {
                available: true,
                map: chunk.data
            }
        });
    } catch(e) {
        res.json({
            error_code: 0,
            result_code: -1
        });
        return;
    }
});

app.use('/', (req, res) => {
    res.status(404);
    res.json({});
});

app.listen(8080, () => console.log('App listening on port 3000!'));