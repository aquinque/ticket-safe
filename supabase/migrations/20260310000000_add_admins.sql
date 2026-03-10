-- Add admin roles for Achille and Adrien
-- user_roles(user_id, role) — role = 'admin' grants access to /admin/review

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email IN (
  'achillequinquenel@gmail.com',
  'adrien.menard100@gmail.com'
)
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
