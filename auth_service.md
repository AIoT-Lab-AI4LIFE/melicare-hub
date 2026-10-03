# MeliAuth

API xác thực tập trung cho nhiều dịch vụ, xây dựng bằng NestJS, PostgreSQL và JWT bất đối xứng RS256.

## Features

- Đăng ký và đăng nhập bằng tên người dùng, email hoặc số điện thoại.
- Chuẩn hóa số Việt Nam sang E.164 (`0901234567` thành `+84901234567`).
- Access token ngắn hạn và refresh token xoay vòng, có thể thu hồi phiên.
- Ký RS256, hỗ trợ `kid`, kiểm tra `issuer`/`audience` và cung cấp JWKS công khai.
- Xác thực bằng Bearer token hoặc cookie HTTP-only.
- Đăng nhập Google tùy chọn.
- Xác minh email bằng mã 6 chữ số và đặt lại mật khẩu bằng mã 8 chữ số.
- Swagger tại `/docs`; kiểm tra trạng thái tại `/api/v1/health`.

## Local Development

```bash
cp .env.example .env
pnpm install
pnpm keys:generate
docker compose up -d postgres
pnpm seed
pnpm dev
```

Nếu cổng 5432 đang được dùng, chạy PostgreSQL bằng `DB_PUBLISHED_PORT=55432 docker compose up -d postgres` và đặt `DB_PORT=55432` trong `.env`.

Chạy toàn bộ hệ thống bằng Docker Compose:

```bash
pnpm keys:generate
docker compose up -d --build
```

API dùng cổng `APP_PUBLISHED_PORT`, mặc định là `3000`. Trong Compose, ứng dụng tự kết nối tới dịch vụ `postgres`.

## Configuration

Sao chép `.env.example` thành `.env` và sửa theo môi trường:

| Biến | Ý nghĩa |
|---|---|
| `API_PREFIX` | Tiền tố API, mặc định `api/v1` |
| `JWT_ISSUER` | `issuer` dùng để xác minh token, ví dụ `https://auth.example.com` |
| `JWT_AUDIENCE` | Danh sách `audience` cách nhau bằng dấu phẩy, ví dụ `service-a,service-b` |
| `JWT_ACCESS_TTL` | Thời gian sống access token, mặc định `15m` |
| `JWT_REFRESH_TTL` | Thời gian sống refresh token, mặc định `30d` |
| `COOKIE_DOMAINS` | Miền cha nhận cookie; để trống để dùng cookie theo máy chủ hiện tại |
| `CORS_ORIGINS` | Các nguồn frontend được gửi yêu cầu kèm cookie |

Chỉ dịch vụ xác thực được giữ `JWT_PRIVATE_KEY`. Dịch vụ con chỉ cần URL JWKS, `JWT_ISSUER` và `audience` của nó.

## Usage

Các ví dụ dùng địa chỉ:

```bash
export AUTH_URL=https://auth.meliq.ai/
```


### 1. Register and Login

```bash
curl -sS "$AUTH_URL/api/v1/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "nguyenvana",
    "displayName": "Nguyễn Văn A",
    "password": "a-strong-password",
    "email": "user@example.com",
    "phoneNumber": "0901234567"
  }'

curl -sS "$AUTH_URL/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"nguyenvana","password":"a-strong-password"}'
```

`identifier` nhận tên người dùng, email hoặc số điện thoại. Số Việt Nam được chuẩn hóa sang E.164; số quốc tế phải ở sẵn định dạng E.164.

Phản hồi của đăng ký, đăng nhập và làm mới token:

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 900,
  "user": {
    "id": 101,
    "username": "nguyenvana",
    "displayName": "Nguyễn Văn A",
    "roles": [],
    "email": "user@example.com",
    "emailVerified": false,
    "phoneNumber": "+84901234567",
    "phoneNumberVerified": false,
    "avatarUrl": null
  }
}
```

### 2. Authenticated Requests

Ứng dụng hoặc dịch vụ con gửi access token qua tiêu đề Bearer:

```bash
curl -sS "$AUTH_URL/api/v1/auth/info" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Trình duyệt có thể dùng cookie HTTP-only do API tạo. Yêu cầu khác nguồn phải bật `credentials`:

```js
const response = await fetch(`${AUTH_URL}/api/v1/auth/info`, {
  credentials: "include",
});
```

Ưu tiên cookie HTTP-only thay vì lưu refresh token trong `localStorage`. Chỉ gửi refresh token tới API làm mới hoặc đăng xuất.

### 3. Refresh Token and Logout

Mỗi lần làm mới sẽ thu hồi refresh token cũ và cấp một cặp token mới. Ứng dụng phải thay cả hai token và tránh gửi nhiều yêu cầu làm mới đồng thời. Dùng lại token cũ sẽ thu hồi mọi phiên làm mới của người dùng.

```bash
# Ứng dụng: gửi token trong nội dung yêu cầu
curl -sS "$AUTH_URL/api/v1/auth/refresh" \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"

# Trình duyệt: đọc refresh token từ cookie HTTP-only
curl -sS -X POST "$AUTH_URL/api/v1/auth/refresh" \
  -b cookies.txt -c cookies.txt

# Đăng xuất: trả về 204, thu hồi phiên và xóa cookie
curl -sS -X POST "$AUTH_URL/api/v1/auth/logout" \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

### 4. Email Verification and Password Reset

Cần cấu hình SMTP. Mã xác minh email có 6 chữ số; mã đặt lại mật khẩu có 8 chữ số.

```bash
# Gửi và xác nhận email (cần access token)
curl -sS -X POST "$AUTH_URL/api/v1/auth/verification/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"method":"email"}'

curl -sS -X POST "$AUTH_URL/api/v1/auth/verification/verify" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"method":"email","code":"012345"}'

# Quên mật khẩu không cần đăng nhập
curl -sS -X POST "$AUTH_URL/api/v1/auth/forgot-password" \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com"}'

curl -sS -X POST "$AUTH_URL/api/v1/auth/reset-password" \
  -H 'Content-Type: application/json' \
  -d '{"code":"01234567","password":"the-new-password"}'
```

Đổi email hoặc số điện thoại sẽ đặt trạng thái xác minh tương ứng về `false`. Làm mới token hoặc đăng nhập lại để nhận claim mới.

## JWT Verification with JWKS

Địa chỉ JWKS:

```text
https://auth.example.com/.well-known/jwks.json
```

Dịch vụ con phải kiểm tra:

- Thuật toán là `RS256` và khóa công khai khớp `kid`.
- `iss` khớp `JWT_ISSUER`.
- `aud` chứa `audience` của dịch vụ.
- `exp` còn hạn và `type` là `access`.

Không dùng payload hoặc `roles` trước khi xác minh xong. JWKS được lưu đệm 300 giây; các thư viện dưới đây tự nạp lại khóa khi gặp `kid` mới.

### JavaScript/TypeScript — `jose`

Cài đặt:

```bash
pnpm add jose
# hoặc: npm install jose
```

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const issuer = "https://auth.example.com";
const audience = "service-a";
const jwks = createRemoteJWKSet(
  new URL(`${issuer}/.well-known/jwks.json`),
);

export interface AccessClaims {
  // MeliAuth phát ID người dùng dưới dạng số.
  sub: number;
  type: "access";
  username: string;
  roles: string[];
  [claim: string]: unknown;
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, jwks, {
    algorithms: ["RS256"],
    issuer,
    audience,
  });

  const claims: Record<string, unknown> = payload;
  if (claims.type !== "access" || typeof claims.sub !== "number") {
    throw new Error("Invalid access token claims");
  }

  return claims as AccessClaims;
}
```

Middleware Express:

```ts
app.use(async (req, res, next) => {
  const match = req.headers.authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.sendStatus(401);

  try {
    res.locals.auth = await verifyAccessToken(match[1]);
    next();
  } catch {
    res.sendStatus(401);
  }
});
```

### Python — `PyJWT`

Cài `PyJWT` và `cryptography` để xử lý RSA:

```bash
python -m pip install 'PyJWT[crypto]'
```

```python
import jwt
from jwt import PyJWKClient

ISSUER = "https://auth.example.com"
AUDIENCE = "service-a"
JWKS_URL = f"{ISSUER}/.well-known/jwks.json"

jwks_client = PyJWKClient(JWKS_URL, cache_keys=True)


def verify_access_token(token: str) -> dict:
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    claims = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        issuer=ISSUER,
        audience=AUDIENCE,
        # MeliAuth phát `sub` dạng số; PyJWT mặc định yêu cầu chuỗi.
        options={
            "require": ["exp", "iat", "iss", "aud", "sub"],
            "verify_sub": False,
        },
    )
    if claims.get("type") != "access" or not isinstance(claims.get("sub"), int):
        raise jwt.InvalidTokenError("token is not an access token")
    return claims
```

Dependency FastAPI:

```python
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError

bearer = HTTPBearer(auto_error=False)


def current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        return verify_access_token(credentials.credentials)
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
```

`sub` là ID người dùng. Access token gồm `sub`, `type`, `username`, `displayName`, `avatarUrl`, `roles`, `email`, `emailVerified`, `phoneNumber`, `phoneNumberVerified`, `iss`, `aud`, `iat` và `exp`.

## Profile, Google, and Admin API

Gửi `PATCH /auth/info`; dùng `null` để xóa ảnh đại diện, email hoặc số điện thoại:

```bash
curl -sS -X PATCH "$AUTH_URL/api/v1/auth/info" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"displayName":"Tên mới","avatarUrl":null}'
```

Đăng nhập Google cần `GOOGLE_CLIENT_ID`. Frontend phải gửi Google OpenID Connect ID token, không phải Google access token:

```bash
curl -sS "$AUTH_URL/api/v1/auth/oauth/google" \
  -H 'Content-Type: application/json' \
  -d "{\"idToken\":\"$GOOGLE_ID_TOKEN\"}"
```

Các API `/api/v1/users` yêu cầu vai trò `admin`. Tài khoản quản trị do lệnh seed tạo sẵn vai trò này.

```bash
# Phân trang và tìm kiếm
curl -sS "$AUTH_URL/api/v1/users?page=1&limit=20&search=nguyen" \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN"

# Tạo tài khoản và gán vai trò
curl -sS -X POST "$AUTH_URL/api/v1/users" \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "username":"operator01",
    "displayName":"Operator",
    "password":"a-strong-password",
    "roles":["operator"]
  }'

# Sửa hoặc xóa
curl -sS -X PATCH "$AUTH_URL/api/v1/users/101" \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"roles":["operator","support"]}'

curl -sS -X DELETE "$AUTH_URL/api/v1/users/101" \
  -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN"
```

API danh sách trả về `{ data, meta }`; `meta` gồm `page`, `limit`, `total` và `pageCount`. Mã lỗi chính: `400` dữ liệu sai, `401` xác thực sai, `403` thiếu quyền quản trị, `404` không tìm thấy và `409` trùng tên người dùng hoặc số điện thoại.

## CI/CD

Với mỗi yêu cầu hợp nhất vào `main`, CI ghép nhánh vào bản `main` mới nhất rồi kiểm tra kiểu, quy tắc mã nguồn, kiểm thử, biên dịch NestJS, kiểm tra Compose và tạo ảnh Docker. CD triển khai sau khi yêu cầu hợp lệ được hợp nhất.

Cấu hình các secret trong môi trường GitHub `production`:

- `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PRIVATE_KEY`: kết nối máy chủ.
- `DEPLOY_PATH`: thư mục chứa mã nguồn trên máy chủ.

Thư mục triển khai phải có sẵn `.env`, `keys/private.pem` và `keys/public.pem` của môi trường sản xuất. CD kéo nhánh `main`, kiểm tra Compose rồi tạo lại hệ thống.

TypeORM tự đồng bộ cấu trúc PostgreSQL khi ứng dụng khởi động. Lệnh seed có thể chạy lại an toàn: tạo quản trị viên ID `1`, mười tài khoản `user51`–`user60`, rồi đặt ID người dùng mới bắt đầu từ `101`. `SEED_ADMIN_PASSWORD` và `SEED_USER_PASSWORD` phải có ít nhất 8 ký tự. Seed không ghi đè thông tin đăng nhập đã có.

## API

| Phương thức | Đường dẫn | Chức năng |
|---|---|---|
| POST | `/api/v1/auth/register` | Đăng ký và cấp token |
| POST | `/api/v1/auth/login` | Đăng nhập bằng tên người dùng, email hoặc số điện thoại |
| POST | `/api/v1/auth/forgot-password` | Gửi mã đặt lại mật khẩu 8 chữ số |
| POST | `/api/v1/auth/reset-password` | Đặt lại mật khẩu bằng mã một lần |
| POST | `/api/v1/auth/verification/send` | Gửi mã xác minh email 6 chữ số |
| POST | `/api/v1/auth/verification/verify` | Xác minh email bằng mã 6 chữ số |
| POST | `/api/v1/auth/refresh` | Xoay refresh token |
| POST | `/api/v1/auth/logout` | Thu hồi phiên và xóa cookie |
| GET | `/api/v1/auth/info` | Lấy hồ sơ hiện tại |
| PATCH | `/api/v1/auth/info` | Cập nhật hồ sơ |
| POST | `/api/v1/auth/oauth/google` | Đăng nhập Google |
| GET | `/api/v1/users` | Liệt kê và tìm người dùng; chỉ quản trị viên |
| GET | `/api/v1/users/:id` | Lấy người dùng; chỉ quản trị viên |
| POST | `/api/v1/users` | Tạo người dùng; chỉ quản trị viên |
| PATCH | `/api/v1/users/:id` | Cập nhật người dùng; chỉ quản trị viên |
| DELETE | `/api/v1/users/:id` | Xóa người dùng; chỉ quản trị viên |
| GET | `/.well-known/jwks.json` | Lấy khóa công khai để xác minh JWT |

Đăng ký, đăng nhập và làm mới token trả token trong nội dung phản hồi, đồng thời đặt cookie HTTP-only cho trình duyệt.

### Email and Password

Cấu hình `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, thông tin đăng nhập SMTP nếu cần và `MAIL_FROM`. Mã đặt lại mật khẩu dùng `PASSWORD_RESET_TTL`; mã xác minh email dùng `EMAIL_VERIFICATION_TTL`. Mặc định là `15m`. Mã chỉ được lưu dưới dạng băm SHA-256 và dùng một lần.

### Cookie Domains

`COOKIE_DOMAINS=.example.com` chia sẻ cookie với các máy chủ như `app.example.com` và `admin.example.com`. Có thể khai báo nhiều miền bằng dấu phẩy, nhưng trình duyệt chỉ nhận cookie khi máy chủ phản hồi được phép đặt miền đó. Một máy chủ xác thực không thể đặt cookie cho các miền gốc khác nhau; trường hợp này cần luồng chuyển hướng trên từng miền hoặc dùng Bearer token.

Với yêu cầu khác trang, khai báo đúng nguồn trong `CORS_ORIGINS`, bật credentials, dùng HTTPS và đặt `COOKIE_SAME_SITE=none`, `COOKIE_SECURE=true` khi cần.

## Key Rotation

Tạo cặp khóa mới, đổi `JWT_KEY_ID`, triển khai khóa riêng mới và giữ khóa công khai cũ trong JWKS đến khi mọi access token cũ hết hạn. Hiện dịch vụ chỉ công bố một khóa; để xoay khóa không gián đoạn, cần mở rộng `TokenService.getJwks()` để công bố cả khóa cũ còn hiệu lực.

Không commit `keys/private.pem`. Git đã bỏ qua thư mục `keys/`.