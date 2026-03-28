import { Hono } from 'hono';
import {
  getNurseriesByContact,
  getBookingsByNurseryContact,
  approveBooking,
  denyBooking,
  getCalendarBookingById,
  getJobById,
  getProfileByFriendId,
  getDocumentsByFriendId,
} from '@line-crm/db';
import type { Env } from '../index.js';

const nurseryStaff = new Hono<Env>();

// ========== 園担当者ダッシュボード ==========

nurseryStaff.get('/api/nursery-staff/dashboard', async (c) => {
  try {
    const friendId = c.get('liffFriendId');
    if (!friendId) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }

    // 担当園を取得
    const nurseries = await getNurseriesByContact(c.env.DB, friendId);
    if (nurseries.length === 0) {
      return c.json({ success: false, error: 'Not a nursery contact' }, 403);
    }

    // 承認待ちbooking
    const pending = await getBookingsByNurseryContact(c.env.DB, friendId, 'pending');
    // 承認済みbooking（今後のシフト）
    const approved = await getBookingsByNurseryContact(c.env.DB, friendId, 'approved');

    return c.json({
      success: true,
      data: {
        nurseries,
        pending,
        approved: approved.filter((b) => {
          // 未来の予定のみ
          if (!b.work_date) return true;
          return b.work_date >= new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
        }),
      },
    });
  } catch (err) {
    console.error('GET /api/nursery-staff/dashboard error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 応募者プロフィール詳細 ==========

nurseryStaff.get('/api/nursery-staff/applicant/:friendId', async (c) => {
  try {
    const staffFriendId = c.get('liffFriendId');
    if (!staffFriendId) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }

    // 園担当者であることを確認
    const nurseries = await getNurseriesByContact(c.env.DB, staffFriendId);
    if (nurseries.length === 0) {
      return c.json({ success: false, error: 'Not a nursery contact' }, 403);
    }

    const applicantFriendId = c.req.param('friendId');
    const profile = await getProfileByFriendId(c.env.DB, applicantFriendId);
    const documents = await getDocumentsByFriendId(c.env.DB, applicantFriendId);

    const workerUrl = c.env.WORKER_URL || '';

    return c.json({
      success: true,
      data: {
        profile: profile
          ? {
              realName: profile.real_name,
              realNameKana: profile.real_name_kana,
              qualificationType: profile.qualification_type,
              experienceYears: profile.experience_years,
              bacterialTestStatus: profile.bacterial_test_status,
            }
          : null,
        documents: documents.map((d) => ({
          docType: d.doc_type,
          status: d.status,
          viewUrl: `${workerUrl}/api/documents/file/${d.id}`,
        })),
      },
    });
  } catch (err) {
    console.error('GET /api/nursery-staff/applicant error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 応募承認 ==========

nurseryStaff.post('/api/nursery-staff/bookings/:id/approve', async (c) => {
  try {
    const staffFriendId = c.get('liffFriendId');
    if (!staffFriendId) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }

    const nurseries = await getNurseriesByContact(c.env.DB, staffFriendId);
    if (nurseries.length === 0) {
      return c.json({ success: false, error: 'Not a nursery contact' }, 403);
    }

    const bookingId = c.req.param('id');
    const booking = await getCalendarBookingById(c.env.DB, bookingId);
    if (!booking) {
      return c.json({ success: false, error: 'Booking not found' }, 404);
    }

    if (booking.approval_status === 'approved') {
      return c.json({ success: false, error: 'Already approved' }, 400);
    }

    // このbookingが担当園のものか確認
    if (booking.job_id) {
      const job = await getJobById(c.env.DB, booking.job_id);
      if (job?.nursery_id) {
        const isStaff = nurseries.some((n) => n.nursery_id === job.nursery_id);
        if (!isStaff) {
          return c.json({ success: false, error: 'Not authorized for this nursery' }, 403);
        }
      }
    }

    const body = await c.req.json<{ note?: string }>().catch(() => ({ note: undefined }));
    await approveBooking(c.env.DB, bookingId, body.note);

    return c.json({ success: true, data: { bookingId, approvalStatus: 'approved' } });
  } catch (err) {
    console.error('POST /api/nursery-staff/bookings/:id/approve error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== 応募却下 ==========

nurseryStaff.post('/api/nursery-staff/bookings/:id/deny', async (c) => {
  try {
    const staffFriendId = c.get('liffFriendId');
    if (!staffFriendId) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }

    const nurseries = await getNurseriesByContact(c.env.DB, staffFriendId);
    if (nurseries.length === 0) {
      return c.json({ success: false, error: 'Not a nursery contact' }, 403);
    }

    const bookingId = c.req.param('id');
    const booking = await getCalendarBookingById(c.env.DB, bookingId);
    if (!booking) {
      return c.json({ success: false, error: 'Booking not found' }, 404);
    }

    if (booking.approval_status === 'denied') {
      return c.json({ success: false, error: 'Already denied' }, 400);
    }

    if (booking.job_id) {
      const job = await getJobById(c.env.DB, booking.job_id);
      if (job?.nursery_id) {
        const isStaff = nurseries.some((n) => n.nursery_id === job.nursery_id);
        if (!isStaff) {
          return c.json({ success: false, error: 'Not authorized for this nursery' }, 403);
        }
      }
    }

    const body = await c.req.json<{ note?: string }>().catch(() => ({ note: undefined }));
    await denyBooking(c.env.DB, bookingId, body.note);

    return c.json({ success: true, data: { bookingId, approvalStatus: 'denied' } });
  } catch (err) {
    console.error('POST /api/nursery-staff/bookings/:id/deny error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { nurseryStaff };
