import ExpoModulesCore
import UIKit
import Vision

// F-03 R-03.1 / R-03.5: face measurements for one still, computed on device with Apple Vision.
// Returns numbers only; the image is read from a local file and nothing is kept.
public class ThirstrFaceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ThirstrFace")

    AsyncFunction("analyze") { (uri: String, promise: Promise) in
      guard let url = URL(string: uri),
            let data = try? Data(contentsOf: url),
            let image = UIImage(data: data),
            let cg = image.cgImage else {
        promise.reject("E_IMAGE", "Could not read the image")
        return
      }
      let orientation = ThirstrFaceModule.orientation(image.imageOrientation)
      DispatchQueue.global(qos: .userInitiated).async {
        let request = VNDetectFaceLandmarksRequest()
        let handler = VNImageRequestHandler(cgImage: cg, orientation: orientation, options: [:])
        do {
          try handler.perform([request])
          let faces = request.results ?? []
          guard let face = faces.first else {
            promise.resolve(["faces": 0])
            return
          }
          var out: [String: Any] = [
            "faces": faces.count,
            "yaw": face.yaw?.doubleValue ?? 0,
            "roll": face.roll?.doubleValue ?? 0,
            "pitch": face.pitch?.doubleValue ?? 0,
            "size": Double(face.boundingBox.width),
          ]
          if let lm = face.landmarks {
            out["leftEye"] = ThirstrFaceModule.openness(lm.leftEye)
            out["rightEye"] = ThirstrFaceModule.openness(lm.rightEye)
            out["mouth"] = ThirstrFaceModule.width(lm.outerLips)
          }
          promise.resolve(out)
        } catch {
          promise.reject("E_VISION", error.localizedDescription)
        }
      }
    }
  }

  // Landmark points are normalised to the face bounding box.
  static func extent(_ r: VNFaceLandmarkRegion2D?) -> (Double, Double) {
    guard let r = r, r.pointCount > 0 else { return (0, 0) }
    let pts = r.normalizedPoints
    let xs = pts.map { Double($0.x) }
    let ys = pts.map { Double($0.y) }
    return ((xs.max() ?? 0) - (xs.min() ?? 0), (ys.max() ?? 0) - (ys.min() ?? 0))
  }

  static func openness(_ r: VNFaceLandmarkRegion2D?) -> Double {
    let (w, h) = extent(r)
    return w > 0 ? h / w : 0
  }

  static func width(_ r: VNFaceLandmarkRegion2D?) -> Double {
    return extent(r).0
  }

  static func orientation(_ o: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch o {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
