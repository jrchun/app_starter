"""scripts/use_supabase.py 테스트(네트워크 없이). 실행: python3 -m unittest discover -s tests"""
import os
import tempfile
import unittest


class UseSupabaseTests(unittest.TestCase):
    """scripts/use_supabase.py: 임시 복사본에서 Supabase 모드 전환을 확인한다."""

    def run_script(self, *args):
        import shutil, subprocess, sys
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        d = tempfile.mkdtemp()
        dst = os.path.join(d, "repo")
        shutil.copytree(root, dst, ignore=shutil.ignore_patterns(".git", ".wrangler", "node_modules", "__pycache__"))
        p = subprocess.run([sys.executable, "scripts/use_supabase.py", *args], cwd=dst, capture_output=True, text=True)
        return dst, p

    def test_switches_to_supabase_mode(self):
        url, key = "https://abcdefghijklmnopqrst.supabase.co", "sb_publishable_test"
        dst, p = self.run_script("--url", url, "--key", key)
        self.assertEqual(p.returncode, 0, p.stderr)
        cfg = open(os.path.join(dst, "web/js/config.js"), encoding="utf-8").read()
        self.assertIn(url, cfg); self.assertIn(key, cfg)
        toml = open(os.path.join(dst, "wrangler.toml"), encoding="utf-8").read()
        self.assertNotIn("d1_databases", toml)
        self.assertIn(f'SUPABASE_URL = "{url}"', toml)
        self.assertIn(f'SUPABASE_KEY = "{key}"', toml)
        self.assertIn('crons = ["30 22 * * *"]', toml)  # 잠들기 방지 예약 작업은 남는다
        # 두 번 실행해도 [vars]가 한 번만 들어간다
        import subprocess, sys
        subprocess.run([sys.executable, "scripts/use_supabase.py", "--url", url, "--key", key], cwd=dst, check=True, capture_output=True)
        self.assertEqual(open(os.path.join(dst, "wrangler.toml"), encoding="utf-8").read().count("[vars]"), 1)
        self.assertFalse(os.path.exists(os.path.join(dst, "web/js/docsync.js")))
        self.assertTrue(os.path.exists(os.path.join(dst, "web/vendor-supabase.js")))
        # 앱 허브용 자기소개서: mode만 supabase로 바뀌고 나머지는 그대로
        import json
        meta = json.load(open(os.path.join(dst, "web/app.json"), encoding="utf-8"))
        self.assertEqual(meta["mode"], "supabase")
        self.assertEqual(meta["schema"], 1)
        # 대표 화면 미리보기 태그가 Supabase 예제 화면에도 있다
        html = open(os.path.join(dst, "web/index.html"), encoding="utf-8").read()
        self.assertIn('property="og:image" content="/og.png"', html)

    def test_keeps_domain_and_drops_hub_login(self):
        """fill이 넣은 내 도메인 주소 칸은 남기고, 허브 로그인(D1 모드 전용)은 뺀다. 두 번 실행해도 [vars]는 하나."""
        import subprocess, sys
        url, key = "https://abcdefghijklmnopqrst.supabase.co", "sb_publishable_test"
        dst, _ = self.run_script("--help")
        wr = os.path.join(dst, "wrangler.toml")
        t = open(wr, encoding="utf-8").read().rstrip("\n") + (
            '\n\n# 허브 로그인 주소(scripts/cf_mcp.mjs fill이 관리한다). 허브에서 한 번 로그인하면 이 앱에서도 편집된다.\n[vars]\nHUB_URL = "https://hub.woongstudio.com"\n'
            '\n# >>> 내 도메인 주소 (scripts/cf_mcp.mjs fill이 관리한다. 손으로 고치지 않는다)\n[[routes]]\npattern = "a.woongstudio.com"\ncustom_domain = true\n# <<< 내 도메인 주소\n')
        open(wr, "w", encoding="utf-8").write(t)
        for _ in range(2):
            subprocess.run([sys.executable, "scripts/use_supabase.py", "--url", url, "--key", key], cwd=dst, check=True, capture_output=True)
        toml = open(wr, encoding="utf-8").read()
        self.assertNotIn("HUB_URL", toml)
        self.assertIn('pattern = "a.woongstudio.com"', toml)
        self.assertEqual(toml.count("[vars]"), 1)
        self.assertIn(f'SUPABASE_URL = "{url}"', toml)

    def test_refuses_secret_key(self):
        _, p = self.run_script("--url", "https://abcdefghijklmnopqrst.supabase.co", "--key", "sb_secret_nope")
        self.assertNotEqual(p.returncode, 0)
        self.assertIn("서비스 키", p.stderr)


if __name__ == "__main__":
    unittest.main()
