const http = require('node:http');

const PORT = Number(process.env.PORT) || 3004;
const MAX_BODY_BYTES = 65_536;

const db = {
  students: [],
  teachers: [],
  attendance: [],
  marks: [],
};
const nextIds = { students: 1, teachers: 1, attendance: 1, marks: 1 };

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new ApiError(413, 'Request body too large (maximum 64 KB)');
    }
    raw += chunk.toString('utf8');
  }

  if (!raw.trim()) throw new ApiError(400, 'A JSON request body is required');

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'Invalid JSON');
  }

  if (!body || Array.isArray(body) || typeof body !== 'object') {
    throw new ApiError(400, 'JSON body must be an object');
  }

  return body;
}

function allowedFields(payload, fields) {
  for (const key of Object.keys(payload)) {
    if (!fields.includes(key)) {
      throw new ApiError(400, `Unknown field: ${key}`);
    }
  }
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, `${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value, field) {
  if (value === undefined) return undefined;
  return requiredText(value, field);
}

function validEmail(value) {
  if (value === undefined) return undefined;
  const email = requiredText(value, 'email');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'email must be a valid email address');
  }
  return email;
}

function positiveId(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ApiError(400, `${field} must be a positive integer`);
  }
  return value;
}

function validateDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, 'date must use YYYY-MM-DD');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, 'date must be a real calendar date');
  }
  return value;
}

function studentExists(studentId) {
  if (!db.students.some((student) => student.id === studentId)) {
    throw new ApiError(400, `Student with id ${studentId} does not exist`);
  }
}

// Validate incoming data for each module. The existing record is merged for PUT,
// so a PUT can change one or more fields without repeating all existing fields.
function validateRecord(resource, payload, existing = {}) {
  const fields = {
    students: ['name', 'age', 'className', 'email'],
    teachers: ['name', 'subject', 'email'],
    attendance: ['studentId', 'date', 'status'],
    marks: ['studentId', 'subject', 'obtained', 'total', 'exam'],
  };
  allowedFields(payload, fields[resource]);
  const data = { ...existing, ...payload };

  if (resource === 'students') {
    const student = { name: requiredText(data.name, 'name') };
    if (data.age !== undefined) {
      if (!Number.isInteger(data.age) || data.age < 1 || data.age > 120) {
        throw new ApiError(400, 'age must be an integer from 1 to 120');
      }
      student.age = data.age;
    }
    if (data.className !== undefined) student.className = optionalText(data.className, 'className');
    if (data.email !== undefined) student.email = validEmail(data.email);
    return student;
  }

  if (resource === 'teachers') {
    const teacher = {
      name: requiredText(data.name, 'name'),
      subject: requiredText(data.subject, 'subject'),
    };
    if (data.email !== undefined) teacher.email = validEmail(data.email);
    return teacher;
  }

  if (resource === 'attendance') {
    const studentId = positiveId(data.studentId, 'studentId');
    studentExists(studentId);
    const date = validateDate(data.date);
    const status = requiredText(data.status, 'status').toLowerCase();
    if (!['present', 'absent', 'late'].includes(status)) {
      throw new ApiError(400, 'status must be Present, Absent, or Late');
    }
    return {
      studentId,
      date,
      status: status[0].toUpperCase() + status.slice(1),
    };
  }

  const studentId = positiveId(data.studentId, 'studentId');
  studentExists(studentId);
  const subject = requiredText(data.subject, 'subject');
  if (typeof data.total !== 'number' || !Number.isFinite(data.total) || data.total <= 0) {
    throw new ApiError(400, 'total must be a number greater than 0');
  }
  if (typeof data.obtained !== 'number' || !Number.isFinite(data.obtained) || data.obtained < 0 || data.obtained > data.total) {
    throw new ApiError(400, 'obtained must be a number between 0 and total');
  }
  const mark = { studentId, subject, obtained: data.obtained, total: data.total };
  if (data.exam !== undefined) mark.exam = optionalText(data.exam, 'exam');
  return mark;
}

function ensureUniqueAttendance(record, currentId = null) {
  const duplicate = db.attendance.some((entry) =>
    entry.studentId === record.studentId &&
    entry.date === record.date &&
    entry.id !== currentId
  );
  if (duplicate) {
    throw new ApiError(409, 'Attendance already exists for this student and date');
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts.length === 0 && req.method === 'GET') {
      return send(res, 200, {
        message: 'Student Management System API (in-memory)',
        modules: ['/students', '/teachers', '/attendance', '/marks'],
        operations: ['GET /module', 'GET /module/:id', 'POST /module', 'PUT /module/:id', 'DELETE /module/:id'],
      });
    }

    const [resource, rawId] = parts;
    if (parts.length < 1 || parts.length > 2 || !Object.hasOwn(db, resource)) {
      return send(res, 404, { error: 'Route not found' });
    }

    let id;
    if (rawId !== undefined) {
      if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(Number(rawId)) || Number(rawId) <= 0) {
        throw new ApiError(400, 'id must be a positive integer');
      }
      id = Number(rawId);
    }

    const records = db[resource];

    if (req.method === 'GET' && id === undefined) {
      return send(res, 200, records);
    }

    if (req.method === 'GET') {
      const record = records.find((item) => item.id === id);
      if (!record) throw new ApiError(404, `${resource} record ${id} not found`);
      return send(res, 200, record);
    }

    if (req.method === 'POST' && id === undefined) {
      const body = await readJson(req);
      const values = validateRecord(resource, body);
      if (resource === 'attendance') ensureUniqueAttendance(values);
      const record = { id: nextIds[resource]++, ...values };
      records.push(record);
      return send(res, 201, record);
    }

    if (req.method === 'PUT' && id !== undefined) {
      const index = records.findIndex((item) => item.id === id);
      if (index === -1) throw new ApiError(404, `${resource} record ${id} not found`);
      const body = await readJson(req);
      const values = validateRecord(resource, body, records[index]);
      if (resource === 'attendance') ensureUniqueAttendance(values, id);
      const updated = { id, ...values };
      records[index] = updated;
      return send(res, 200, updated);
    }

    if (req.method === 'DELETE' && id !== undefined) {
      const index = records.findIndex((item) => item.id === id);
      if (index === -1) throw new ApiError(404, `${resource} record ${id} not found`);
      const [deleted] = records.splice(index, 1);
      const result = { message: `${resource} record deleted`, deleted };

      if (resource === 'students') {
        const beforeAttendance = db.attendance.length;
        const beforeMarks = db.marks.length;
        db.attendance = db.attendance.filter((item) => item.studentId !== id);
        db.marks = db.marks.filter((item) => item.studentId !== id);
        result.relatedRecordsRemoved = {
          attendance: beforeAttendance - db.attendance.length,
          marks: beforeMarks - db.marks.length,
        };
      }
      return send(res, 200, result);
    }

    res.setHeader('Allow', id === undefined ? 'GET, POST, OPTIONS' : 'GET, PUT, DELETE, OPTIONS');
    return send(res, 405, { error: 'Method not allowed for this endpoint' });
  } catch (error) {
    if (error instanceof ApiError) return send(res, error.status, { error: error.message });
    console.error(error);
    return send(res, 500, { error: 'Internal server error' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Student Management System running on http://localhost:${PORT}`);
  });
}

module.exports = server;