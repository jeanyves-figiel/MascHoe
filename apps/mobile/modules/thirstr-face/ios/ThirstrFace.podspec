Pod::Spec.new do |s|
  s.name           = 'ThirstrFace'
  s.version        = '1.0.0'
  s.summary        = 'On-device face landmarks for Thirstr liveness (Apple Vision).'
  s.description    = 'F-03 liveness: yaw, pitch, eye openness and mouth width from Apple Vision. Images never leave the device.'
  s.author         = 'Thirstr'
  s.homepage       = 'https://thirstr.fun'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'Vision'
  s.source_files   = '**/*.{h,m,swift}'
end
