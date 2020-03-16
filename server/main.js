import Koa from 'koa';
import send from 'koa-send';
import Router from '@koa/router';
import { createReadStream } from 'fs';

const router = Router();

const port = process.env.PORT || 3000;
const app = new Koa();

const handle = async (ctx, next) => {
    ctx.type = 'html';
    ctx.body = createReadStream('public/company.html');
}

const resp = ({ response }) => {
    response.body = "hoi";
}

router.get('/company/:name', handle);

router.get('/api/*', resp);

app.use(async (ctx, next) => {
    const path = ctx.path === "/" ? "/index.html" : ctx.path;
    if (["/index.html", "/style.css", "/watercooler.svg", "/watercoolerchat.js"].includes(path)) {
        await send(ctx, path, { root: process.cwd() + '/public' });
    }
    await next();
});

app.use(router.routes());

app.listen(port, () => console.log(`watercoolerchat available on port ${port}`));
