"""Check exported field integrity. This does not establish physical validation."""
from pathlib import Path
import json
import math
import sys
import xml.etree.ElementTree as ET


def inspect(case):
    files = list((case / 'VTK').rglob('internal.vtu'))
    if len(files) != 1:
        raise ValueError('Expected one exported latest-time internal.vtu')
    piece = ET.parse(files[0]).getroot().find('.//Piece')
    count = int(piece.get('NumberOfCells'))
    report = json.loads((case / 'case-report.json').read_text())
    if count != report['cells']:
        raise ValueError('Exported cell count differs from generated initial fields')
    fields, ranges = {}, {}
    for item in piece.findall('./CellData/DataArray'):
        if item.get('format') != 'ascii':
            raise ValueError('Expected ASCII VTK fields')
        name = item.get('Name')
        data = [float(v) for v in (item.text or '').split()]
        components = int(item.get('NumberOfComponents', '1'))
        if len(data) != count * components or not all(math.isfinite(v) for v in data):
            raise ValueError('Invalid exported field: ' + name)
        fields[name] = data
        ranges[name] = dict(min=min(data), max=max(data))
    for name in ['p', 'T', 'rho', 'k', 'omega', 'U']:
        if name not in fields:
            raise ValueError('Missing exported field: ' + name)
        if name != 'U' and min(fields[name]) <= 0:
            raise ValueError('Non-positive field: ' + name)
    speed = [math.sqrt(sum(v*v for v in fields['U'][i:i+3])) for i in range(0, count*3, 3)]
    ranges['speed_mps'] = dict(min=min(speed), max=max(speed))
    report['execution_check'] = 'completed; latest-time fields finite and positive'
    report['exported_field_ranges'] = ranges
    report['validation_note'] = 'Integrity checks only; no chemistry, radiation, vacuum or mesh-convergence validation.'
    (case / 'case-report.json').write_text(json.dumps(report, indent=2))
    (case / 'RUN_COMPLETE').write_text('Numerical execution and field integrity checks passed.\n')
    print(json.dumps(ranges, indent=2))
    return report


if __name__ == '__main__':
    inspect(Path(sys.argv[1]))
