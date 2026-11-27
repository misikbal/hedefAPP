"""
Bildirim seslerini üretir (yalnız standart kütüphane): apps/mobile/assets/sounds/*.wav
Çalıştır: python3 -I scripts/make-sounds.py
Sesler marimba/çan benzeri: temel ton + hızlı sönen üst kısmi tonlar, yumuşak atak, üstel sönüm.
"""
import math
import os
import struct
import wave

RATE = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'apps', 'mobile', 'assets', 'sounds')


def note(freq, dur, amp=1.0, decay=4.0, partials=((1, 1.0, 1.0), (2.0, 0.28, 2.2), (3.99, 0.12, 4.5)), attack=0.006):
    n = int(RATE * dur)
    out = []
    for i in range(n):
        t = i / RATE
        env = min(1.0, t / attack)
        v = 0.0
        for mult, a, dmul in partials:
            v += a * math.sin(2 * math.pi * freq * mult * t) * math.exp(-decay * dmul * t)
        out.append(v * env * amp)
    return out


def mix(total, events):
    buf = [0.0] * int(RATE * total)
    for start, samples in events:
        s = int(RATE * start)
        for i, v in enumerate(samples):
            if s + i < len(buf):
                buf[s + i] += v
    return buf


def write(name, buf, peak=0.82):
    m = max(abs(v) for v in buf) or 1
    # sonda 30 ms sönümle tık sesi olmasın
    fade = int(RATE * 0.03)
    for i in range(fade):
        buf[-1 - i] *= i / fade
    path = os.path.join(OUT, name)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(v / m * peak * 32767)) for v in buf))
    print(path, f'{len(buf) / RATE:.2f} sn')


HZ = lambda semis: 440.0 * 2 ** (semis / 12)  # A4'ten yarım ton
C5, D5, E5, G5, A5, B5, C6, E6, G6 = (HZ(s) for s in (3, 5, 7, 10, 12, 14, 15, 19, 22))
A4, F4, D4 = HZ(0), HZ(-4), HZ(-7)

# Hatırlatma: yumuşak iki notalı "ding-dong" (E6 → B5), tanıdık ama telefon zil sesine benzemez
write('takip_hatirlatma.wav', mix(1.3, [
    (0.0, note(E6, 0.9, 1.0, decay=3.2)),
    (0.16, note(B5, 1.1, 0.9, decay=2.6)),
]))

# Ceza: alçak, ciddi; iki kez tekrarlanan küçük üçlü aşağı (A4 → F4), biraz daha keskin atak
sharp = ((1, 1.0, 1.0), (2.0, 0.45, 1.6), (3.0, 0.2, 2.5))
write('takip_ceza.wav', mix(1.25, [
    (0.0, note(A4, 0.35, 1.0, decay=7, partials=sharp, attack=0.003)),
    (0.14, note(F4, 0.45, 1.0, decay=6, partials=sharp, attack=0.003)),
    (0.52, note(A4, 0.35, 0.85, decay=7, partials=sharp, attack=0.003)),
    (0.66, note(F4, 0.6, 0.85, decay=4.5, partials=sharp, attack=0.003)),
]))

# Zirve (odak / mola bitti): yükselen C majör arpej ve çan gibi tutulan son nota
write('takip_zirve.wav', mix(1.9, [
    (0.0, note(C5, 0.6, 0.8, decay=4)),
    (0.11, note(E5, 0.6, 0.8, decay=4)),
    (0.22, note(G5, 0.6, 0.85, decay=4)),
    (0.34, note(C6, 1.5, 1.0, decay=2.0)),
    (0.34, note(G6, 1.2, 0.25, decay=2.6)),
]))

# Claude: kısa, cam gibi tek vuruş (G5 + D6 beşli), dikkat çeker ama yormaz
glass = ((1, 1.0, 1.0), (2.76, 0.18, 2.0), (5.4, 0.06, 3.5))
write('takip_bildirim.wav', mix(0.9, [
    (0.0, note(G5, 0.85, 1.0, decay=4.5, partials=glass)),
    (0.05, note(HZ(17), 0.8, 0.55, decay=5, partials=glass)),
]))
